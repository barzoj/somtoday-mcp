import { mkdtemp, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiClient } from "../../src/api/client.js";
import { FileLock, type SessionLock } from "../../src/auth/lock.js";
import { MemorySecretStore } from "../../src/auth/memory-store.js";
import { SessionManager } from "../../src/auth/session.js";
import {
  refreshAccessToken,
  resolveApiBaseUrl,
} from "../../src/auth/tokens.js";
import {
  DEFAULT_API_BASE,
  LOGIN_INSTRUCTION,
  TOKEN_URL,
} from "../../src/constants.js";
import {
  AuthNetworkError,
  LoginRequiredError,
  RefreshRejectedError,
  SessionUnreadableError,
} from "../../src/errors.js";
import { runLogout, runStatus } from "../../src/commands.js";
import {
  StoreUnreadableError,
  type StoredSession,
} from "../../src/auth/store.js";
import { FAKE_SESSION, formBody, jsonResponse } from "../helpers.js";

const NOW = 10_000_000;

/** Token endpoint model: each refresh token works once and rotates. */
function tokenServer(initial = FAKE_SESSION.refreshToken) {
  let current = initial;
  let counter = 0;
  const used: string[] = [];
  const handle = (init?: RequestInit): Response => {
    const presented = formBody(init).get("refresh_token") ?? "";
    used.push(presented);
    if (presented !== current) {
      return jsonResponse(400, { error: "invalid_grant" });
    }
    counter += 1;
    current = `refresh-rotated-${counter}`;
    return jsonResponse(200, {
      access_token: `access-${counter}`,
      refresh_token: current,
      expires_in: 3600,
    });
  };
  return {
    handle,
    used,
    get current() {
      return current;
    },
  };
}

function routedFetch(
  server: ReturnType<typeof tokenServer>,
  api: (url: string, init?: RequestInit) => Response | Promise<Response> = () =>
    jsonResponse(200, { ok: true }),
) {
  const apiCalls: Array<{ url: string; auth: string | null }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === TOKEN_URL) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return server.handle(init);
    }
    apiCalls.push({
      url,
      auth: new Headers(init?.headers).get("authorization"),
    });
    return api(url, init);
  };
  return { fetchFn, apiCalls };
}

/** In-memory mutex shared by several SessionManagers, like the file lock across processes. */
class SharedLock implements SessionLock {
  private tail: Promise<unknown> = Promise.resolve();
  withLock<T>(run: () => Promise<T>): Promise<T> {
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

async function storeWith(session: StoredSession = FAKE_SESSION) {
  const store = new MemorySecretStore();
  await store.save(session);
  return store;
}

describe("refresh: token rotation across sessions", () => {
  it("two sessions on one store never present the same refresh token twice (shared lock)", async () => {
    const server = tokenServer();
    const store = await storeWith();
    const lock = new SharedLock();
    const { fetchFn } = routedFetch(server);
    const a = new SessionManager(store, fetchFn, () => NOW, lock);
    const b = new SessionManager(store, fetchFn, () => NOW, lock);

    await Promise.all([a.refresh(), b.refresh()]);

    expect(server.used).toEqual([
      FAKE_SESSION.refreshToken,
      "refresh-rotated-1",
    ]);
    expect((await store.load())?.refreshToken).toBe(server.current);
    expect(await a.getAccessToken()).not.toBe(await b.getAccessToken());
  });

  it("re-reads storage before refreshing, so a token rotated elsewhere is picked up", async () => {
    const server = tokenServer();
    const store = await storeWith();
    const { fetchFn } = routedFetch(server);
    const a = new SessionManager(store, fetchFn, () => NOW);
    const b = new SessionManager(store, fetchFn, () => NOW);

    await a.refresh(); // b has an old view, but must not reuse the spent token
    await b.refresh();

    expect(server.used).toEqual([
      FAKE_SESSION.refreshToken,
      "refresh-rotated-1",
    ]);
  });

  it("on invalid_grant re-reads storage once and retries with the newer token", async () => {
    const server = tokenServer();
    const store = await storeWith();
    let raced = false;
    const fetchFn: typeof fetch = async (input, init) => {
      if (String(input) === TOKEN_URL && !raced) {
        // Another process rotates the token between our load and our POST.
        raced = true;
        const other = server.handle(init);
        const body = (await other.json()) as { refresh_token: string };
        await store.save({ ...FAKE_SESSION, refreshToken: body.refresh_token });
        return jsonResponse(400, { error: "invalid_grant" });
      }
      return String(input) === TOKEN_URL
        ? server.handle(init)
        : jsonResponse(200, {});
    };
    const session = new SessionManager(store, fetchFn, () => NOW);
    await session.refresh();
    expect(server.used).toEqual([
      FAKE_SESSION.refreshToken,
      "refresh-rotated-1",
    ]);
    expect((await store.load())?.refreshToken).toBe("refresh-rotated-2");
  });

  it("gives up after one re-read when storage has the same rejected token", async () => {
    const store = await storeWith();
    let calls = 0;
    const fetchFn: typeof fetch = async () => {
      calls += 1;
      return jsonResponse(400, { error: "invalid_grant" });
    };
    const session = new SessionManager(store, fetchFn, () => NOW);
    await expect(session.refresh()).rejects.toBeInstanceOf(LoginRequiredError);
    expect(calls).toBe(1);
    const status = await session.status();
    expect(status.loggedIn).toBe(false);
    expect(status.lastRefresh).toMatchObject({
      outcome: "rejected",
      status: 400,
      detail: "invalid_grant",
    });
  });
});

describe("refresh: persistence", () => {
  it("stores the rotated token before the new access token is used", async () => {
    const server = tokenServer();
    const store = await storeWith();
    const { fetchFn } = routedFetch(server, async () => {
      expect((await store.load())?.refreshToken).toBe("refresh-rotated-1");
      return jsonResponse(200, {});
    });
    const session = new SessionManager(store, fetchFn, () => NOW);
    await new ApiClient(session, fetchFn).get("/account/me");
  });

  it("keeps the old refresh token when the response has none", async () => {
    const store = await storeWith();
    const fetchFn: typeof fetch = async () =>
      jsonResponse(200, { access_token: "access-x", expires_in: 3600 });
    const session = new SessionManager(store, fetchFn, () => NOW);
    await session.refresh();
    expect(await session.getAccessToken()).toBe("access-x");
    expect((await store.load())?.refreshToken).toBe(FAKE_SESSION.refreshToken);
  });

  it("keeps working from memory when storage cannot be written, and says so", async () => {
    const server = tokenServer();
    const store = await storeWith();
    let failSaves = true;
    const original = store.save.bind(store);
    store.save = async (session) => {
      if (failSaves) throw new Error("disk full");
      return original(session);
    };
    const { fetchFn } = routedFetch(server);
    const session = new SessionManager(store, fetchFn, () => NOW);

    await session.refresh();
    expect((await session.status()).lastRefresh?.outcome).toBe(
      "ok-not-persisted",
    );
    // Storage still has the spent token; the next refresh must use the in-memory one.
    session.clearAccessToken();
    failSaves = false;
    await session.refresh();
    expect(server.used).toEqual([
      FAKE_SESSION.refreshToken,
      "refresh-rotated-1",
    ]);
    expect((await store.load())?.refreshToken).toBe("refresh-rotated-2");
    expect((await session.status()).lastRefresh?.outcome).toBe("ok");
  });
});

describe("refresh: error kinds", () => {
  it("network failures are not reported as 'log in again'", async () => {
    const store = await storeWith();
    const fetchFn: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const session = new SessionManager(store, fetchFn, () => NOW);
    const error = await session.refresh().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthNetworkError);
    expect((error as Error).message).not.toContain(LOGIN_INSTRUCTION);
    expect((await session.status()).lastRefresh?.outcome).toBe("network");
    expect((await session.status()).loggedIn).toBe(true);
  });

  it("token endpoint 5xx counts as a network problem", async () => {
    const fetchFn: typeof fetch = async () => jsonResponse(503, {});
    await expect(
      refreshAccessToken({ refreshToken: "r", clientId: "c", fetchFn }),
    ).rejects.toBeInstanceOf(AuthNetworkError);
  });

  it("invalid_client is one request, with no legacy client-id fallback", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = async (_input, init) => {
      calls += 1;
      expect(formBody(init).get("client_id")).toBe("somtoday-leerling-native");
      return jsonResponse(401, { error: "invalid_client" });
    };
    await expect(
      refreshAccessToken({
        refreshToken: "r",
        clientId: "somtoday-leerling-native",
        fetchFn,
      }),
    ).rejects.toBeInstanceOf(RefreshRejectedError);
    expect(calls).toBe(1);
  });

  it("an unreadable store is reported as such", async () => {
    const store = new MemorySecretStore();
    store.load = async () => {
      throw new StoreUnreadableError(
        "keychain",
        "keychain read failed (exit 51)",
      );
    };
    store.inspect = async () => ({
      state: "unreadable",
      source: "keychain",
      error: "keychain read failed (exit 51)",
    });
    const session = new SessionManager(store, fetch, () => NOW);
    await expect(session.refresh()).rejects.toBeInstanceOf(
      SessionUnreadableError,
    );
    expect(await session.status()).toMatchObject({
      loggedIn: false,
      storage: "unreadable",
      source: "keychain",
      error: "keychain read failed (exit 51)",
    });
  });

  it("only accepts somtoday_api_url on https *.somtoday.nl", () => {
    expect(resolveApiBaseUrl("https://api.somtoday.nl")).toBe(
      "https://api.somtoday.nl",
    );
    expect(resolveApiBaseUrl("https://api-test.somtoday.nl/")).toBe(
      "https://api-test.somtoday.nl",
    );
    expect(resolveApiBaseUrl("https://evil.example")).toBe(DEFAULT_API_BASE);
    expect(resolveApiBaseUrl("https://somtoday.nl.evil.example")).toBe(
      DEFAULT_API_BASE,
    );
    expect(resolveApiBaseUrl("http://api.somtoday.nl")).toBe(DEFAULT_API_BASE);
    expect(resolveApiBaseUrl(undefined)).toBe(DEFAULT_API_BASE);
  });
});

describe("API retries", () => {
  it("does not refresh again when another call already replaced the access token", async () => {
    const server = tokenServer();
    const store = await storeWith();
    let first = true;
    const { fetchFn, apiCalls } = routedFetch(server, () => {
      if (first) {
        first = false;
        return jsonResponse(401, {});
      }
      return jsonResponse(200, {});
    });
    const session = new SessionManager(store, fetchFn, () => NOW);
    session.seedAccessToken("old-access", NOW + 3_600_000);
    const client = new ApiClient(session, fetchFn);
    const pending = client.get("/account/me");
    await pending;
    expect(server.used).toHaveLength(1);
    expect(apiCalls.map((call) => call.auth)).toEqual([
      "Bearer old-access",
      "Bearer access-1",
    ]);
    // A second rejection of the *old* token must not trigger another refresh.
    await session.refreshAfterRejection("old-access");
    expect(server.used).toHaveLength(1);
  });

  it("retries a bare 403 once with a renewed token", async () => {
    const server = tokenServer();
    const store = await storeWith();
    const responses = [
      new Response("", { status: 403 }),
      jsonResponse(200, { ok: 1 }),
    ];
    const { fetchFn, apiCalls } = routedFetch(server, () => responses.shift()!);
    const session = new SessionManager(store, fetchFn, () => NOW);
    session.seedAccessToken("old-access", NOW + 3_600_000);
    const result = await new ApiClient(session, fetchFn).get("/x");
    expect(result.status).toBe(200);
    expect(apiCalls).toHaveLength(2);
    expect(server.used).toHaveLength(1);
  });

  it("does not retry a 403 that carries a body", async () => {
    const server = tokenServer();
    const store = await storeWith();
    const { fetchFn, apiCalls } = routedFetch(server, () =>
      jsonResponse(403, { message: "no studiewijzer" }),
    );
    const session = new SessionManager(store, fetchFn, () => NOW);
    session.seedAccessToken("old-access", NOW + 3_600_000);
    await expect(new ApiClient(session, fetchFn).get("/x")).rejects.toThrow(
      "API HTTP 403",
    );
    expect(apiCalls).toHaveLength(1);
    expect(server.used).toHaveLength(0);
  });
});

describe("status and logout commands", () => {
  it("status prints storage details and never a token", async () => {
    const store = await storeWith();
    const session = new SessionManager(store, fetch, () => NOW);
    const lines: string[] = [];
    const ok = await runStatus(session, false, (line) => lines.push(line));
    expect(ok).toBe(true);
    const out = lines.join("\n");
    expect(JSON.parse(out)).toMatchObject({
      loggedIn: true,
      storage: "ok",
      source: "memory",
      school: FAKE_SESSION.schoolLabel,
      clientId: FAKE_SESSION.clientId,
      apiHost: "api.example.test",
    });
    expect(out).not.toContain(FAKE_SESSION.refreshToken);
  });

  it("status --check renews and calls /account/me", async () => {
    const server = tokenServer();
    const store = await storeWith();
    const { fetchFn, apiCalls } = routedFetch(server);
    const session = new SessionManager(store, fetchFn, () => NOW);
    const lines: string[] = [];
    const ok = await runStatus(session, true, (l) => lines.push(l), fetchFn);
    expect(ok).toBe(true);
    expect(JSON.parse(lines[0]!).check).toEqual({
      refresh: "ok",
      accountMe: 200,
    });
    expect(apiCalls[0]?.url).toContain("/account/me");
    expect(lines[0]).not.toContain("access-1");
    expect(lines[0]).not.toContain("refresh-rotated-1");
  });

  it("logout deletes the stored session", async () => {
    const store = await storeWith();
    const session = new SessionManager(store, fetch, () => NOW);
    await runLogout(session, () => undefined);
    expect(await store.load()).toBeNull();
    expect((await session.status()).storage).toBe("missing");
  });
});

describe("file lock", () => {
  it("serializes critical sections", async () => {
    const dir = await mkdtemp(join(tmpdir(), "somtoday-lock-"));
    const lock = new FileLock(join(dir, "session.lock"), { pollMs: 5 });
    const other = new FileLock(join(dir, "session.lock"), { pollMs: 5 });
    const events: string[] = [];
    const section = (name: string) => async () => {
      events.push(`${name}-in`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push(`${name}-out`);
    };
    await Promise.all([
      lock.withLock(section("a")),
      other.withLock(section("b")),
    ]);
    expect(events).toEqual(["a-in", "a-out", "b-in", "b-out"]);
  });

  it("takes over a stale lock file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "somtoday-lock-"));
    const path = join(dir, "session.lock");
    await writeFile(path, "999999999 old\n");
    const old = new Date(Date.now() - 10 * 60_000);
    await utimes(path, old, old);
    const lock = new FileLock(path, { timeoutMs: 1_000, pollMs: 5 });
    expect(await lock.withLock(async () => "ran")).toBe("ran");
  });

  it("times out instead of hanging when the lock is held", async () => {
    const dir = await mkdtemp(join(tmpdir(), "somtoday-lock-"));
    const path = join(dir, "session.lock");
    await writeFile(path, `${process.pid} now\n`);
    const lock = new FileLock(path, { timeoutMs: 50, pollMs: 5 });
    await expect(lock.withLock(async () => "never")).rejects.toThrow(
      /Timed out waiting for the session lock/,
    );
  });
});
