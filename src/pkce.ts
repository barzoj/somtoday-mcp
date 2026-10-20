import { createHash, randomBytes } from "node:crypto";

const UNRESERVED =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export function base64url(input: Buffer | Uint8Array): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// Largest multiple of the alphabet size that fits in a byte; bytes at or above
// it are rejected so every character is equally likely (no modulo bias).
const UNBIASED_LIMIT = 256 - (256 % UNRESERVED.length);

export function generateVerifier(
  length = 64,
  random: (size: number) => Uint8Array = randomBytes,
): string {
  const size = Math.min(128, Math.max(43, length));
  let out = "";
  while (out.length < size) {
    for (const byte of random(size)) {
      if (byte >= UNBIASED_LIMIT) continue;
      out += UNRESERVED[byte % UNRESERVED.length];
      if (out.length === size) break;
    }
  }
  return out;
}

export function challengeFromVerifier(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

export function generateState(): string {
  return base64url(randomBytes(16));
}

export function isJwtString(value: string): boolean {
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(value);
}
