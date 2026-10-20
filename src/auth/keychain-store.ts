import { spawn } from "node:child_process";
import { KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE } from "../constants.js";
import { FileSecretStore } from "./file-store.js";
import type { SecretStore, StoredSession } from "./store.js";

export type SecurityRunner = (args: string[]) => Promise<string>;

function defaultSecurity(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("security", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.replace(/\n$/, ""));
        return;
      }
      reject(new Error(stderr.trim() || `security exited ${code}`));
    });
  });
}

export class KeychainSecretStore implements SecretStore {
  constructor(
    private readonly fallback: SecretStore,
    private readonly runSecurity: SecurityRunner = defaultSecurity,
  ) {}

  async save(session: StoredSession): Promise<void> {
    try {
      // `security` requires -w VALUE on argv (getopt `w:`). Stdin is ignored.
      await this.runSecurity([
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
        JSON.stringify(session),
      ]);
    } catch {
      await this.deleteKeychainItem();
      await this.fallback.save(session);
    }
  }

  async load(): Promise<StoredSession | null> {
    try {
      const raw = await this.runSecurity([
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
      ]);
      const parsed = JSON.parse(raw) as StoredSession;
      if (!parsed.refreshToken || !parsed.clientId) {
        return null;
      }
      return parsed;
    } catch {
      return this.fallback.load();
    }
  }

  async delete(): Promise<void> {
    await this.deleteKeychainItem();
    await this.fallback.delete();
  }

  private async deleteKeychainItem(): Promise<void> {
    try {
      await this.runSecurity([
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
      ]);
    } catch {
      // item may already be missing
    }
  }
}

export function createDefaultStore(): SecretStore {
  const file = new FileSecretStore();
  if (process.platform === "darwin") {
    return new KeychainSecretStore(file);
  }
  return file;
}
