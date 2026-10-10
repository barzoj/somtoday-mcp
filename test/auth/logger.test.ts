import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, redact } from "../../src/log.js";
import { FAKE_JWT } from "../helpers.js";

describe("logger redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts JWT-shaped strings and sensitive field names", () => {
    const raw = [
      `Bearer ${FAKE_JWT}`,
      "code=secret-code",
      "code_verifier=pkce-secret",
      "access_token=tok",
      "refresh_token=ref",
      "id_token=idtok",
      JSON.stringify({ access_token: "abc", refresh_token: "def" }),
    ].join(" ");

    const cleaned = redact(raw);
    expect(cleaned).not.toContain(FAKE_JWT);
    expect(cleaned).toContain("[redacted]");
    expect(cleaned).not.toContain("secret-code");
    expect(cleaned).not.toContain("pkce-secret");
    expect(cleaned).not.toMatch(/access_token=tok/);
    expect(cleaned).not.toContain("idtok");
  });

  it("writes only redacted text to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError(`token=${FAKE_JWT} code=visible-secret`);
    const printed = String(spy.mock.calls[0]?.[0]);
    expect(printed).not.toContain(FAKE_JWT);
    expect(printed).not.toContain("visible-secret");
    expect(printed).toContain("[redacted]");
  });
});
