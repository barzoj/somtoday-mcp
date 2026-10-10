import { createHash, randomBytes } from "node:crypto";

const UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

export function base64url(input: Buffer | Uint8Array): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generateVerifier(length = 64): string {
  const size = Math.min(128, Math.max(43, length));
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) {
    out += UNRESERVED[bytes[i]! % UNRESERVED.length];
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
