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
    // Windows has no POSIX permission bits.
    if (process.platform !== "win32") expect(mode).toBe(0o600);
    expect(await store.load()).toEqual(FAKE_SESSION);
  });

  it("passes the session to security as the -w argv value", async () => {
    let stored = "";
    const fallback = new MemorySecretStore();
    const store = new KeychainSecretStore(fallback, async (args) => {
      const flag = args.indexOf("-w");
      if (args[0] === "add-generic-password" && flag >= 0) {
        stored = args[flag + 1] ?? "";
      }
      return stored;
    });
    await store.save(FAKE_SESSION);
    expect(JSON.parse(stored)).toEqual(FAKE_SESSION);
    expect(await store.load()).toEqual(FAKE_SESSION);
  });

  it("clears a leftover keychain item before writing the file fallback", async () => {
    const stale = { ...FAKE_SESSION, refreshToken: "stale-refresh-not-real" };
    let keychain: string | null = JSON.stringify(stale);
    const dir = await mkdtemp(join(tmpdir(), "somtoday-mcp-kc-"));
    const fallback = new FileSecretStore(join(dir, "session.json"));
    const store = new KeychainSecretStore(fallback, async (args) => {
      if (args[0] === "add-generic-password") {
        throw new Error("security add failed");
      }
      if (args[0] === "delete-generic-password") {
        keychain = null;
        return "";
      }
      if (args[0] === "find-generic-password") {
        if (!keychain) {
          throw new Error("not found");
        }
        return keychain;
      }
      throw new Error(`unexpected ${args[0]}`);
    });
    await store.save(FAKE_SESSION);
    expect(keychain).toBeNull();
    expect(await store.load()).toEqual(FAKE_SESSION);
    const mode = (await stat(fallback.path)).mode & 0o777;
    // Windows has no POSIX permission bits.
    if (process.platform !== "win32") expect(mode).toBe(0o600);
  });
});
