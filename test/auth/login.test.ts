import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl } from "../../src/auth/authorize.js";
import { runLogin } from "../../src/auth/login.js";
import { MemorySecretStore } from "../../src/auth/memory-store.js";
import { SessionManager } from "../../src/auth/session.js";
import { parseStoredSession } from "../../src/auth/store.js";
import { idTokenClaim } from "../../src/auth/tokens.js";
import { TOKEN_URL } from "../../src/constants.js";
import { packageName, packageVersion } from "../../src/packageVersion.js";
import { formBody, jsonResponse, scriptedFetch } from "../helpers.js";

const TENANT = "22222222-2222-4222-8222-222222222222";

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part(claims)}.sig`;
}

function tokenResponse(extra: Record<string, unknown> = {}) {
  return jsonResponse(200, {
    access_token: "access-fixture",
    refresh_token: "refresh-fixture",
    expires_in: 3600,
    somtoday_api_url: "https://api.somtoday.nl",
    ...extra,
  });
}

/** Simulates the browser: returns the callback with the state from the URL. */
function browser(seen: string[]) {
  return async (authorizeUrl: string) => {
    seen.push(authorizeUrl);
    const state = new URL(authorizeUrl).searchParams.get("state");
    return `somtoday://nl.topicus.somtoday.leerling/oauth/callback?code=c0de&state=${state}`;
  };
}

function quietIo(lines: string[] = []) {
  return { write: (line: string) => void lines.push(line) };
}

describe("login without a school prompt", () => {
  it("opens the authorize URL without tenant_uuid and takes the tenant and school from the tokens", async () => {
    const seen: string[] = [];
    const { fetchFn, calls } = scriptedFetch([
      async () =>
        tokenResponse({
          somtoday_tenant: TENANT,
          id_token: jwt({ orgname: "Fixture College" }),
        }),
    ]);
    const store = new MemorySecretStore();
    const lines: string[] = [];
    await runLogin({
      session: new SessionManager(store, fetchFn),
      fetchFn,
      io: quietIo(lines),
      captureRedirect: browser(seen),
    });

    expect(seen).toHaveLength(1);
    const url = new URL(seen[0]!);
    expect(url.searchParams.has("tenant_uuid")).toBe(false);
    expect(calls.map((call) => call.url)).toEqual([TOKEN_URL]);
    expect(formBody(calls[0]?.init).has("tenant_uuid")).toBe(false);

    const stored = await store.load();
    expect(stored?.tenantUuid).toBe(TENANT);
    expect(stored?.schoolLabel).toBe("Fixture College");
    expect(stored?.apiBaseUrl).toBe("https://api.somtoday.nl");
    expect(lines.join("\n")).toContain("School: Fixture College");
    expect(lines.join("\n")).not.toContain("refresh-fixture");
  });

  it("uses --school-uuid as tenant_uuid when given", async () => {
    const seen: string[] = [];
    const { fetchFn } = scriptedFetch([
      async () => tokenResponse({ id_token: jwt({ orgname: "X" }) }),
    ]);
    const store = new MemorySecretStore();
    await runLogin({
      session: new SessionManager(store, fetchFn),
      fetchFn,
      io: quietIo(),
      captureRedirect: browser(seen),
      schoolUuid: TENANT,
    });
    expect(new URL(seen[0]!).searchParams.get("tenant_uuid")).toBe(TENANT);
    expect((await store.load())?.tenantUuid).toBe(TENANT);
  });

  it("rejects a --school-uuid that is not a UUID before opening a browser", async () => {
    const seen: string[] = [];
    const { fetchFn } = scriptedFetch([]);
    await expect(
      runLogin({
        session: new SessionManager(new MemorySecretStore(), fetchFn),
        fetchFn,
        io: quietIo(),
        captureRedirect: browser(seen),
        schoolUuid: "Some School",
      }),
    ).rejects.toThrow(/UUID/);
    expect(seen).toHaveLength(0);
  });

  it("falls back to schoolgegevens for the label when the id_token has no orgname", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () => tokenResponse({ somtoday_tenant: TENANT }),
      async () =>
        jsonResponse(200, [
          { instellingsnaam: "Fixture Lyceum", plaats: "TESTSTAD" },
        ]),
    ]);
    const store = new MemorySecretStore();
    await runLogin({
      session: new SessionManager(store, fetchFn),
      fetchFn,
      io: quietIo(),
      captureRedirect: browser([]),
    });
    expect(calls[1]?.url).toBe(
      "https://api.somtoday.nl/rest/v1/leerlingen/verzorger/schoolgegevens",
    );
    const headers = calls[1]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer access-fixture");
    expect(headers["User-Agent"]).toBe(`${packageName()}/${packageVersion()}`);
    expect(calls[1]?.init?.method ?? "GET").toBe("GET");
    expect((await store.load())?.schoolLabel).toBe("Fixture Lyceum (TESTSTAD)");
  });

  it("still logs in when no school name or tenant is available", async () => {
    const { fetchFn } = scriptedFetch([
      async () => tokenResponse(),
      async () => jsonResponse(403, { error: "forbidden" }),
    ]);
    const store = new MemorySecretStore();
    await runLogin({
      session: new SessionManager(store, fetchFn),
      fetchFn,
      io: quietIo(),
      captureRedirect: browser([]),
    });
    const stored = await store.load();
    expect(stored?.tenantUuid).toBeUndefined();
    expect(stored?.schoolLabel).toBe("Somtoday");
  });

  it("does not send the token to an api url outside *.somtoday.nl", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () => tokenResponse({ somtoday_api_url: "https://evil.example" }),
      async () => jsonResponse(200, []),
    ]);
    const store = new MemorySecretStore();
    await runLogin({
      session: new SessionManager(store, fetchFn),
      fetchFn,
      io: quietIo(),
      captureRedirect: browser([]),
    });
    expect(calls[1]?.url.startsWith("https://api.somtoday.nl/")).toBe(true);
    expect((await store.load())?.apiBaseUrl).toBe("https://api.somtoday.nl");
  });
});

describe("helpers", () => {
  it("builds an authorize URL without tenant_uuid when none is given", () => {
    const url = new URL(buildAuthorizeUrl({ codeChallenge: "c", state: "s" }));
    expect(url.searchParams.has("tenant_uuid")).toBe(false);
  });

  it("reads a string claim from an id_token and ignores junk", () => {
    expect(idTokenClaim(jwt({ orgname: " Fixture " }), "orgname")).toBe(
      "Fixture",
    );
    expect(idTokenClaim(jwt({ orgname: 5 }), "orgname")).toBeUndefined();
    expect(idTokenClaim("not-a-jwt", "orgname")).toBeUndefined();
    expect(idTokenClaim("a.%%%.c", "orgname")).toBeUndefined();
  });

  it("accepts stored sessions without a tenant (picked on the login page)", () => {
    const session = parseStoredSession(
      JSON.stringify({
        refreshToken: "r",
        clientId: "somtoday-leerling-native",
        apiBaseUrl: "https://api.somtoday.nl",
      }),
    );
    expect(session.tenantUuid).toBeUndefined();
    expect(session.schoolLabel).toBe("Somtoday");
  });
});
