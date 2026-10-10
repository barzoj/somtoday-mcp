import { describe, expect, it } from "vitest";
import { parseRedirectUrl } from "../../src/auth/redirect.js";

describe("redirect parser", () => {
  it("accepts somtodayleerling://oauth/callback", () => {
    const parsed = parseRedirectUrl(
      "somtodayleerling://oauth/callback?code=auth-code-1&state=abc",
    );
    expect(parsed).toEqual({ code: "auth-code-1", state: "abc" });
  });

  it("accepts host oauth with port 443", () => {
    const parsed = parseRedirectUrl(
      "somtodayleerling://oauth:443/callback?code=auth-code-2&state=def",
    );
    expect(parsed).toEqual({ code: "auth-code-2", state: "def" });
    const url = new URL("somtodayleerling://oauth:443/callback?code=x&state=y");
    expect(url.hostname).toBe("oauth");
    expect(url.port).toBe("443");
  });

  it("accepts the native custom scheme", () => {
    const parsed = parseRedirectUrl(
      "somtoday://nl.topicus.somtoday.leerling/oauth/callback?code=auth-code-3&state=ghi",
    );
    expect(parsed).toEqual({ code: "auth-code-3", state: "ghi" });
  });
});
