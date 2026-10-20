import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE } from "../constants.js";
import { logError } from "../log.js";
import { FileSecretStore } from "./file-store.js";
import {
  parseStoredSession,
  StoreUnreadableError,
  type SecretStore,
  type StoreInspection,
  type StoredSession,
} from "./store.js";

export const SECURITY_BIN = "/usr/bin/security";

export type CommandResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

/** Runs a command; `input` is written to stdin. Never rejects on non-zero exit. */
export type CommandRunner = (
  command: string,
  args: string[],
  input?: string,
) => Promise<CommandResult>;

export const runCommand: CommandRunner = (command, args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });

/** Hex-encode UTF-8 for `security add-generic-password -X`. */
export function encodeSecretForKeychain(secret: string): string {
  return Buffer.from(secret, "utf8").toString("hex");
}

/**
 * Decode `security find-generic-password -w` output. `security` prints the
 * password as hex when it considers it non-printable (and for some long values
 * on recent macOS), otherwise as the raw string.
 */
export function decodeKeychainPassword(stdout: string): string {
  const trimmed = stdout.replace(/\r?\n$/, "");
  if (!trimmed || trimmed.startsWith("{")) {
    return trimmed;
  }
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, "hex").toString("utf8");
  }
  return trimmed;
}

function describeFailure(result: CommandResult, what: string): string {
  const stderr = result.stderr.trim() || "<empty>";
  return `${what} (exit ${result.code ?? "null"}; stderr=${stderr})`;
}

function isNotFound(result: CommandResult): boolean {
  return (
    result.code === 44 ||
    (result.code !== 0 && /could not be found/i.test(result.stderr))
  );
}

/** Raw access to one generic-password item via /usr/bin/security. */
export class MacKeychain {
  constructor(
    private readonly run: CommandRunner = runCommand,
    private readonly service = KEYCHAIN_SERVICE,
    private readonly account = KEYCHAIN_ACCOUNT,
  ) {}

  /** null when the item does not exist; throws when it exists but cannot be read. */
  async get(): Promise<string | null> {
    const result = await this.run(SECURITY_BIN, [
      "find-generic-password",
      "-s",
      this.service,
      "-a",
      this.account,
      "-w",
    ]);
    if (isNotFound(result)) {
      return null;
    }
    if (result.code !== 0) {
      throw new Error(describeFailure(result, "keychain read failed"));
    }
    return decodeKeychainPassword(result.stdout);
  }

  /**
   * Writes through `security -i` so the secret goes over stdin, not argv
   * (argv is visible in `ps`). `-X` takes hex, so JSON quoting is irrelevant.
   */
  async set(secret: string): Promise<void> {
    const line = `add-generic-password -U -s ${this.service} -a ${this.account} -X ${encodeSecretForKeychain(secret)}\n`;
    const result = await this.run(SECURITY_BIN, ["-i"], line);
    if (
      result.code !== 0 ||
      /error|failed|denied|unable/i.test(result.stderr)
    ) {
      throw new Error(describeFailure(result, "keychain write failed"));
    }
  }

  async delete(): Promise<void> {
    const result = await this.run(SECURITY_BIN, [
      "delete-generic-password",
      "-s",
      this.service,
      "-a",
      this.account,
    ]);
    if (result.code !== 0 && !isNotFound(result)) {
      throw new Error(describeFailure(result, "keychain delete failed"));
    }
  }
}

type KeychainRead =
  | { kind: "ok"; session: StoredSession }
  | { kind: "missing" }
  | { kind: "unreadable"; error: string };

/**
 * macOS Keychain first, `session.json` as fallback.
 * - Writes are verified by reading them back; on any mismatch the keychain item
 *   is removed and the session goes to the file.
 * - A broken keychain item never hides a valid file.
 * - After a verified keychain write the stale file is removed.
 */
export class KeychainSecretStore implements SecretStore {
  constructor(
    private readonly fallback: SecretStore,
    private readonly keychain: MacKeychain = new MacKeychain(),
  ) {}

  async save(session: StoredSession): Promise<void> {
    const serialized = JSON.stringify(session);
    try {
      await this.keychain.set(serialized);
      const readBack = await this.keychain.get();
      if (readBack === serialized) {
        await this.fallback.delete().catch(() => undefined);
        return;
      }
      logError(
        `keychain read-back mismatch (got ${readBack === null ? "nothing" : `${readBack.length} chars`}); storing session in file instead`,
      );
    } catch (error) {
      logError(`${(error as Error).message}; storing session in file instead`);
    }
    await this.keychain.delete().catch(() => undefined);
    await this.fallback.save(session);
  }

  async load(): Promise<StoredSession | null> {
    const read = await this.readKeychain();
    if (read.kind === "ok") {
      return read.session;
    }
    const fromFile = await this.fallback.load();
    if (fromFile) {
      return fromFile;
    }
    if (read.kind === "unreadable") {
      throw new StoreUnreadableError("keychain", read.error);
    }
    return null;
  }

  async delete(): Promise<void> {
    await this.keychain.delete().catch((error: Error) => {
      logError(error.message);
    });
    await this.fallback.delete();
  }

  async inspect(): Promise<StoreInspection> {
    const read = await this.readKeychain();
    if (read.kind === "ok") {
      return { state: "ok", source: "keychain", session: read.session };
    }
    const file = await this.fallback.inspect();
    if (read.kind === "missing") {
      return file;
    }
    if (file.state === "ok") {
      return {
        ...file,
        warning: `keychain item is unreadable (${read.error}); using the file instead`,
      };
    }
    return { state: "unreadable", source: "keychain", error: read.error };
  }

  private async readKeychain(): Promise<KeychainRead> {
    let raw: string | null;
    try {
      raw = await this.keychain.get();
    } catch (error) {
      return { kind: "unreadable", error: (error as Error).message };
    }
    if (raw === null) {
      return { kind: "missing" };
    }
    if (!raw.trim()) {
      return { kind: "unreadable", error: "keychain item is empty" };
    }
    try {
      return { kind: "ok", session: parseStoredSession(raw) };
    } catch (error) {
      return {
        kind: "unreadable",
        error: `keychain item ${(error as Error).message}`,
      };
    }
  }
}

export function keychainEnabled(
  platform: NodeJS.Platform = process.platform,
  hasSecurity: boolean = existsSync(SECURITY_BIN),
): boolean {
  if (process.env.SOMTODAY_MCP_DISABLE_KEYCHAIN) {
    return false;
  }
  return platform === "darwin" && hasSecurity;
}

export function createDefaultStore(): SecretStore {
  const file = new FileSecretStore();
  return keychainEnabled() ? new KeychainSecretStore(file) : file;
}
