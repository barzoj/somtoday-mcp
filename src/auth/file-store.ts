import { mkdir, readFile, unlink, writeFile, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { SecretStore, StoredSession } from "./store.js";

export function defaultSessionPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "somtoday-mcp", "session.json");
}

export class FileSecretStore implements SecretStore {
  constructor(private readonly filePath = defaultSessionPath()) {}

  get path(): string {
    return this.filePath;
  }

  async save(session: StoredSession): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, JSON.stringify(session), {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(this.filePath, 0o600);
  }

  async load(): Promise<StoredSession | null> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredSession;
      if (
        !parsed.refreshToken ||
        !parsed.clientId ||
        !parsed.tenantUuid ||
        !parsed.apiBaseUrl
      ) {
        return null;
      }
      return {
        refreshToken: parsed.refreshToken,
        clientId: parsed.clientId,
        tenantUuid: parsed.tenantUuid,
        apiBaseUrl: parsed.apiBaseUrl,
        schoolLabel: parsed.schoolLabel ?? parsed.tenantUuid,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async delete(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
}
