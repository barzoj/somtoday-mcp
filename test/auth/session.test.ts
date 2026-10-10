import { describe, expect, it } from "vitest";
import { MemorySecretStore } from "../../src/auth/memory-store.js";
import { SessionManager } from "../../src/auth/session.js";
import { ApiClient } from "../../src/api/client.js";
import { LOGIN_INSTRUCTION, TOKEN_URL } from "../../src/constants.js";
import { FAKE_SESSION, jsonResponse, scriptedFetch } from "../helpers.js";

describe("session token reuse and refresh", () => {
  it("reuses a fresh access token", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () => jsonResponse(200, { ok: true }),
    ]);
    const store = new MemorySecretStore();
    await store.save(FAKE_SESSION);
    const session = new SessionManager(store, fetchFn, () => 10_000_000);
    session.seedAccessToken("fresh-access", 10_000_000 + 3_600_000);
    const client = new ApiClient(session, fetchFn);
    await client.get("/account/me");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).not.toBe(TOKEN_URL);
  });

  it("refreshes when the access token is inside 60 seconds of expiry", async () => {
    const now = 10_000_000;
    const { fetchFn, calls } = scriptedFetch([
      async (url) => {
        expect(url).toBe(TOKEN_URL);
        return jsonResponse(200, {
          access_token: "rotated-access",
          refresh_token: "rotated-refresh",
          expires_in: 3600,
        });
      },
      async () => jsonResponse(200, { ok: true }),
    ]);
    const store = new MemorySecretStore();
    await store.save(FAKE_SESSION);
    const session = new SessionManager(store, fetchFn, () => now);
    session.seedAccessToken("almost-expired", now + 30_000);
    const client = new ApiClient(session, fetchFn);
    await client.get("/account/me");
    expect(calls[0]?.url).toBe(TOKEN_URL);
    expect(await store.load()).toMatchObject({ refreshToken: "rotated-refresh" });
  });

  it("refreshes once and retries once on API 401, then stops", async () => {
    const now = 10_000_000;
    const { fetchFn, calls } = scriptedFetch([
      async () => jsonResponse(401, { error: "invalid_token" }),
      async (url) => {
        expect(url).toBe(TOKEN_URL);
        return jsonResponse(200, {
          access_token: "after-401",
          refresh_token: "refresh-after-401",
          expires_in: 3600,
        });
      },
      async () => jsonResponse(401, { error: "invalid_token" }),
    ]);
    const store = new MemorySecretStore();
    await store.save(FAKE_SESSION);
    const session = new SessionManager(store, fetchFn, () => now);
    session.seedAccessToken("stale-access", now + 3_600_000);
    const client = new ApiClient(session, fetchFn);

    await expect(client.get("/account/me")).rejects.toThrow(LOGIN_INSTRUCTION);

    const apiCalls = calls.filter((call) => !call.url.startsWith(TOKEN_URL));
    const refreshCalls = calls.filter((call) => call.url === TOKEN_URL);
    expect(apiCalls).toHaveLength(2);
    expect(refreshCalls).toHaveLength(1);
  });
});
