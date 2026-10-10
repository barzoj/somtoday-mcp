import { describe, expect, it } from "vitest";
import { challengeFromVerifier } from "../../src/pkce.js";

describe("PKCE", () => {
  it("matches the RFC 7636 S256 vector", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(challengeFromVerifier(verifier)).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
