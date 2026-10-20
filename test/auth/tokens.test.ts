import { describe, expect, it } from "vitest";
import { runLogin } from "../../src/auth/login.js";
import { MemorySecretStore } from "../../src/auth/memory-store.js";
import { SessionManager } from "../../src/auth/session.js";
import {
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "../../src/auth/tokens.js";
import {
  NATIVE_CLIENT_ID,
  REDIRECT_URI,
  SCHOOLS_URL,
  TOKEN_URL,
} from "../../src/constants.js";
import { FAKE_JWT, formBody, jsonResponse, scriptedFetch } from "../helpers.js";

const schoolsPayload = [
  {
    instellingen: [
      {
        uuid: "11111111-1111-4111-8111-111111111111",
        naam: "Fixture College",
        plaats: "TESTSTAD",
      },
    ],
  },
];

function loginIo() {
  return {
    ask: async () => "Fixture College",
    write: () => undefined,
  };
}

describe("token exchange", () => {
  it("sends a form-urlencoded body with the authorize client_id and redirect_uri", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () =>
        jsonResponse(200, {
          access_token: "access-plain",
          refresh_token: "refresh-plain",
          expires_in: 3600,
          somtoday_api_url: "https://api.example.test",
          id_token: FAKE_JWT,
        }),
    ]);

    const tokens = await exchangeAuthorizationCode({
      code: "auth-code",
      verifier: "verifier-value",
      tenantUuid: "tenant-1",
      fetchFn,
    });

    expect(tokens.accessToken).toBe("access-plain");
    expect(calls[0]?.url).toBe(TOKEN_URL);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const body = formBody(calls[0]?.init);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe(NATIVE_CLIENT_ID);
    expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("verifier-value");
    expect(body.get("scope")).toBe("openid");
  });

  it("does not call the token endpoint when state mismatches", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async (url) => {
        expect(url).toBe(SCHOOLS_URL);
        return jsonResponse(200, schoolsPayload);
      },
    ]);
    const session = new SessionManager(new MemorySecretStore(), fetchFn);
    await expect(
      runLogin({
        session,
        fetchFn,
        io: loginIo(),
        captureRedirect: async () =>
          "somtodayleerling://oauth/callback?code=auth-code&state=wrong-state",
      }),
    ).rejects.toThrow(/state mismatch/i);
    expect(calls.filter((call) => call.url === TOKEN_URL)).toHaveLength(0);
  });

  it("does not call the token endpoint when code is missing", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async (url) => {
        expect(url).toBe(SCHOOLS_URL);
        return jsonResponse(200, schoolsPayload);
      },
    ]);
    const session = new SessionManager(new MemorySecretStore(), fetchFn);
    await expect(
      runLogin({
        session,
        fetchFn,
        io: loginIo(),
        captureRedirect: async (authorizeUrl) => {
          const state = new URL(authorizeUrl).searchParams.get("state");
          return `somtoday://nl.topicus.somtoday.leerling/oauth/callback?state=${state}`;
        },
      }),
    ).rejects.toThrow(/no authorization code/i);
    expect(calls.filter((call) => call.url === TOKEN_URL)).toHaveLength(0);
  });
});

describe("refresh", () => {
  it("uses the client id stored at login, not a hardcoded UUID", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () =>
        jsonResponse(200, {
          access_token: "access-2",
          refresh_token: "refresh-2",
          expires_in: 3600,
        }),
    ]);

    await refreshAccessToken({
      refreshToken: "refresh-plain",
      clientId: "stored-client-from-login",
      fetchFn,
    });

    const body = formBody(calls[0]?.init);
    expect(body.get("client_id")).toBe("stored-client-from-login");
    expect(body.get("client_id")).not.toMatch(/^D50E/i);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("scope")).toBe("openid");
  });
});
