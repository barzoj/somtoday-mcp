import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileSecretStore } from "../../src/auth/file-store.js";
import { KeychainSecretStore } from "../../src/auth/keychain-store.js";
import { MemorySecretStore } from "../../src/auth/memory-store.js";
import { FAKE_SESSION } from "../helpers.js";

describe("secret stores", () => {
  it("saves, loads, and deletes against the in-memory fake", async () => {
    const store = new MemorySecretStore();
    expect(await store.load()).toBeNull();
    await store.save(FAKE_SESSION);
    expect(await store.load()).toEqual(FAKE_SESSION);
    await store.delete();
    expect(await store.load()).toBeNull();
  });

  it("creates the file fallback with mode 0600", async () => {
    const dir = await mkdtemp(join(tmpdir(), "somtoday-mcp-"));
    const path = join(dir, "session.json");
    const store = new FileSecretStore(path);
    await store.save(FAKE_SESSION);
    const mode = (await stat(path)).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(await store.load()).toEqual(FAKE_SESSION);
  });

  it("falls back to the file store when the keychain command fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "somtoday-mcp-kc-"));
    const fallback = new FileSecretStore(join(dir, "session.json"));
    const store = new KeychainSecretStore(fallback, async () => {
      throw new Error("security unavailable");
    });
    await store.save(FAKE_SESSION);
    expect(await store.load()).toEqual(FAKE_SESSION);
    const mode = (await stat(fallback.path)).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
