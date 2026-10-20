import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl } from "../../src/auth/authorize.js";
import {
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "../../src/auth/tokens.js";
import { NATIVE_CLIENT_ID, REDIRECT_URI } from "../../src/constants.js";

describe("authorize URL", () => {
  it("uses the native client, custom redirect, S256, tenant, and state", () => {
    const url = new URL(
      buildAuthorizeUrl({
        codeChallenge: "challenge-value",
        state: "state-value",
        tenantUuid: "tenant-uuid-1",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://inloggen.somtoday.nl/oauth2/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe(NATIVE_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("tenant_uuid")).toBe("tenant-uuid-1");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("session")).toBe("no_session");
    expect(url.search).not.toMatch(/password/i);
    expect(url.searchParams.has("password")).toBe(false);
  });
});

describe("claims parameter", () => {
  it("matches the official app on authorize, code exchange, and refresh", async () => {
    const expected = {
      id_token: {
        given_name: null,
        leerlingen: null,
        orgname: null,
        affiliation: { values: ["student", "parent/guardian"] },
      },
    };
    const url = new URL(
      buildAuthorizeUrl({ codeChallenge: "c", state: "s", tenantUuid: "t" }),
    );
    expect(JSON.parse(url.searchParams.get("claims")!)).toEqual(expected);

    const bodies: URLSearchParams[] = [];
    const fetchFn: typeof fetch = async (_input, init) => {
      bodies.push(new URLSearchParams(String(init?.body)));
      return new Response(
        JSON.stringify({
          access_token: "a",
          refresh_token: "r",
          expires_in: 60,
        }),
        { status: 200 },
      );
    };
    await exchangeAuthorizationCode({
      code: "code",
      verifier: "v",
      tenantUuid: "t",
      fetchFn,
    });
    await refreshAccessToken({ refreshToken: "r", clientId: "c", fetchFn });
    for (const body of bodies) {
      expect(JSON.parse(body.get("claims")!)).toEqual(expected);
    }
  });
});
