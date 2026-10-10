import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl } from "../../src/auth/authorize.js";
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
