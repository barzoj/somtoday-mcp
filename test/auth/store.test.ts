import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSecretStore } from "../../src/auth/file-store.js";
import {
  decodeKeychainPassword,
  encodeSecretForKeychain,
  keychainEnabled,
  KeychainSecretStore,
  MacKeychain,
  SECURITY_BIN,
  type CommandResult,
  type CommandRunner,
} from "../../src/auth/keychain-store.js";
import { MemorySecretStore } from "../../src/auth/memory-store.js";
import { StoreUnreadableError } from "../../src/auth/store.js";
import { FAKE_SESSION } from "../helpers.js";

async function tempFileStore(): Promise<FileSecretStore> {
  const dir = await mkdtemp(join(tmpdir(), "somtoday-mcp-"));
  return new FileSecretStore(join(dir, "session.json"));
}

async function expectMode0600(path: string): Promise<void> {
  // Windows has no POSIX permission bits.
  if (process.platform === "win32") return;
  expect((await stat(path)).mode & 0o777).toBe(0o600);
}

type FakeSecurity = {
  run: CommandRunner;
  calls: Array<{ args: string[]; input?: string }>;
  item: { value: string | null };
};

/**
 * Minimal model of /usr/bin/security for one item. `readAs` controls how
 * `find-generic-password -w` prints it (macOS prints hex for some values).
 */
function fakeSecurity(
  options: {
    readAs?: "raw" | "hex" | "empty";
    readError?: CommandResult;
    writeError?: CommandResult;
  } = {},
): FakeSecurity {
  const item = { value: null as string | null };
  const calls: FakeSecurity["calls"] = [];
  const ok = (stdout = ""): CommandResult => ({ code: 0, stdout, stderr: "" });
  const notFound: CommandResult = {
    code: 44,
    stdout: "",
    stderr:
      "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.\n",
  };
  const run: CommandRunner = async (command, args, input) => {
    expect(command).toBe(SECURITY_BIN);
    calls.push({ args, input });
    if (args[0] === "-i") {
      if (options.writeError) return options.writeError;
      const match =
        /^add-generic-password -U -s \S+ -a \S+ -X ([0-9a-f]+)\n$/.exec(
          input ?? "",
        );
      if (!match) return { code: 1, stdout: "", stderr: "bad command" };
      item.value = Buffer.from(match[1]!, "hex").toString("utf8");
      return ok();
    }
    if (args[0] === "find-generic-password") {
      if (options.readError) return options.readError;
      if (item.value === null) return notFound;
      if (options.readAs === "empty") return ok("\n");
      if (options.readAs === "hex")
        return ok(`${encodeSecretForKeychain(item.value)}\n`);
      return ok(`${item.value}\n`);
    }
    if (args[0] === "delete-generic-password") {
      if (item.value === null) return notFound;
      item.value = null;
      return ok();
    }
    return { code: 2, stdout: "", stderr: `unexpected ${args[0]}` };
  };
  return { run, calls, item };
}

describe("memory and file stores", () => {
  it("saves, loads, and deletes against the in-memory fake", async () => {
    const store = new MemorySecretStore();
    expect(await store.load()).toBeNull();
    await store.save(FAKE_SESSION);
    expect(await store.load()).toEqual(FAKE_SESSION);
    await store.delete();
    expect(await store.load()).toBeNull();
  });

  it("creates the file fallback with mode 0600", async () => {
    const store = await tempFileStore();
    await store.save(FAKE_SESSION);
    await expectMode0600(store.path);
    expect(await store.load()).toEqual(FAKE_SESSION);
    expect(await store.inspect()).toEqual({
      state: "ok",
      source: "file",
      session: FAKE_SESSION,
    });
  });

  it("reports a corrupt file as unreadable instead of logged out", async () => {
    const store = await tempFileStore();
    await store.save(FAKE_SESSION);
    await writeFile(store.path, "{not json", "utf8");
    await expect(store.load()).rejects.toBeInstanceOf(StoreUnreadableError);
    expect(await store.inspect()).toMatchObject({
      state: "unreadable",
      source: "file",
    });
  });

  it("treats a file without a refresh token as unreadable", async () => {
    const store = await tempFileStore();
    await store.save(FAKE_SESSION);
    await writeFile(
      store.path,
      JSON.stringify({ ...FAKE_SESSION, refreshToken: "" }),
    );
    await expect(store.load()).rejects.toThrow(/missing fields: refreshToken/);
  });
});

describe("keychain store", () => {
  it("writes via `security -i` stdin as hex, never as an argv value", async () => {
    const security = fakeSecurity();
    const store = new KeychainSecretStore(
      await tempFileStore(),
      new MacKeychain(security.run),
    );
    await store.save(FAKE_SESSION);

    const write = security.calls.find((call) => call.args[0] === "-i");
    expect(write?.args).toEqual(["-i"]);
    expect(write?.input).toContain(
      encodeSecretForKeychain(JSON.stringify(FAKE_SESSION)),
    );
    for (const call of security.calls) {
      expect(call.args.join(" ")).not.toContain(FAKE_SESSION.refreshToken);
    }
    expect(await store.load()).toEqual(FAKE_SESSION);
  });

  it("decodes hex output from find-generic-password", async () => {
    const security = fakeSecurity({ readAs: "hex" });
    const store = new KeychainSecretStore(
      await tempFileStore(),
      new MacKeychain(security.run),
    );
    await store.save(FAKE_SESSION);
    expect(await store.load()).toEqual(FAKE_SESSION);
    expect((await store.inspect()).state).toBe("ok");
  });

  it("removes a stale file after a verified keychain write", async () => {
    const file = await tempFileStore();
    await file.save({ ...FAKE_SESSION, refreshToken: "stale-file-not-real" });
    const store = new KeychainSecretStore(
      file,
      new MacKeychain(fakeSecurity().run),
    );
    await store.save(FAKE_SESSION);
    expect(await file.load()).toBeNull();
  });

  it("falls back to the file when the read-back does not match", async () => {
    const security = fakeSecurity({ readAs: "empty" });
    const file = await tempFileStore();
    const store = new KeychainSecretStore(file, new MacKeychain(security.run));
    await store.save(FAKE_SESSION);

    expect(security.item.value).toBeNull();
    expect(await file.load()).toEqual(FAKE_SESSION);
    expect(await store.load()).toEqual(FAKE_SESSION);
    await expectMode0600(file.path);
  });

  it("falls back to the file when the keychain write fails", async () => {
    const security = fakeSecurity({
      writeError: {
        code: 1,
        stdout: "",
        stderr: "User interaction is not allowed.",
      },
    });
    const file = await tempFileStore();
    const store = new KeychainSecretStore(file, new MacKeychain(security.run));
    await store.save(FAKE_SESSION);
    expect(await store.load()).toEqual(FAKE_SESSION);
    expect(JSON.parse(await readFile(file.path, "utf8"))).toEqual(FAKE_SESSION);
  });

  it("does not let a broken keychain item hide a valid file", async () => {
    const security = fakeSecurity();
    security.item.value = "garbage";
    const file = await tempFileStore();
    await file.save(FAKE_SESSION);
    const store = new KeychainSecretStore(file, new MacKeychain(security.run));

    expect(await store.load()).toEqual(FAKE_SESSION);
    const inspection = await store.inspect();
    expect(inspection).toMatchObject({ state: "ok", source: "file" });
    expect(inspection.state === "ok" && inspection.warning).toMatch(
      /keychain item is unreadable/,
    );
  });

  it("reports a broken keychain item with no file as unreadable, not logged out", async () => {
    const security = fakeSecurity();
    security.item.value = "garbage";
    const store = new KeychainSecretStore(
      await tempFileStore(),
      new MacKeychain(security.run),
    );
    await expect(store.load()).rejects.toBeInstanceOf(StoreUnreadableError);
    expect(await store.inspect()).toMatchObject({
      state: "unreadable",
      source: "keychain",
    });
  });

  it("reports keychain access errors with exit code and stderr", async () => {
    const security = fakeSecurity({
      readError: {
        code: 51,
        stdout: "",
        stderr: "security: User interaction is not allowed.",
      },
    });
    const store = new KeychainSecretStore(
      await tempFileStore(),
      new MacKeychain(security.run),
    );
    const inspection = await store.inspect();
    expect(inspection.state).toBe("unreadable");
    expect(inspection.state === "unreadable" && inspection.error).toMatch(
      /exit 51; stderr=security: User interaction is not allowed/,
    );
  });

  it("reports missing when neither keychain nor file has a session", async () => {
    const store = new KeychainSecretStore(
      await tempFileStore(),
      new MacKeychain(fakeSecurity().run),
    );
    expect(await store.load()).toBeNull();
    expect(await store.inspect()).toEqual({ state: "missing" });
  });

  it("delete clears both the keychain item and the file", async () => {
    const security = fakeSecurity();
    const file = await tempFileStore();
    const store = new KeychainSecretStore(file, new MacKeychain(security.run));
    await store.save(FAKE_SESSION);
    await file.save(FAKE_SESSION);
    await store.delete();
    expect(security.item.value).toBeNull();
    expect(await file.load()).toBeNull();
  });
});

describe("keychain helpers", () => {
  const saved = process.env.SOMTODAY_MCP_DISABLE_KEYCHAIN;
  afterEach(() => {
    if (saved === undefined) delete process.env.SOMTODAY_MCP_DISABLE_KEYCHAIN;
    else process.env.SOMTODAY_MCP_DISABLE_KEYCHAIN = saved;
  });

  it("decodes raw JSON, hex, and strips one trailing newline", () => {
    const json = JSON.stringify(FAKE_SESSION);
    expect(decodeKeychainPassword(`${json}\n`)).toBe(json);
    expect(decodeKeychainPassword(`${encodeSecretForKeychain(json)}\n`)).toBe(
      json,
    );
    expect(decodeKeychainPassword("\n")).toBe("");
  });

  it("uses the keychain only on macOS with /usr/bin/security, unless disabled", () => {
    delete process.env.SOMTODAY_MCP_DISABLE_KEYCHAIN;
    expect(keychainEnabled("darwin", true)).toBe(true);
    expect(keychainEnabled("darwin", false)).toBe(false);
    expect(keychainEnabled("linux", true)).toBe(false);
    process.env.SOMTODAY_MCP_DISABLE_KEYCHAIN = "1";
    expect(keychainEnabled("darwin", true)).toBe(false);
  });
});
