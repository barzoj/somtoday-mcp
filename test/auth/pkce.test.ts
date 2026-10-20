import { describe, expect, it } from "vitest";
import { challengeFromVerifier, generateVerifier } from "../../src/pkce.js";

describe("PKCE", () => {
  it("matches the RFC 7636 S256 vector", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(challengeFromVerifier(verifier)).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("generateVerifier", () => {
  it("uses only RFC 7636 unreserved characters and clamps the length", () => {
    expect(generateVerifier(10)).toMatch(/^[A-Za-z0-9._~-]{43}$/);
    expect(generateVerifier(64)).toMatch(/^[A-Za-z0-9._~-]{64}$/);
    expect(generateVerifier(500)).toHaveLength(128);
  });

  it("rejects bytes that would bias the distribution", () => {
    // 66-char alphabet: bytes >= 198 must be skipped, not wrapped.
    const feeds = [
      Uint8Array.from({ length: 43 }, (_, i) => (i % 2 ? 255 : 0)),
      new Uint8Array(43).fill(1),
    ];
    let call = 0;
    const verifier = generateVerifier(43, () => feeds[Math.min(call++, 1)]!);
    // First feed yields 22 "A"s (bytes 0); 255s are dropped; rest are "B".
    expect(verifier).toBe("A".repeat(22) + "B".repeat(21));
  });
});
