import {
  chmod,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  inspectByLoading,
  parseStoredSession,
  StoreUnreadableError,
  type SecretStore,
  type StoreInspection,
  type StoredSession,
} from "./store.js";

export function configDir(): string {
  if (process.env.SOMTODAY_MCP_CONFIG_DIR) {
    return process.env.SOMTODAY_MCP_CONFIG_DIR;
  }
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "somtoday-mcp");
}

export function defaultSessionPath(): string {
  return join(configDir(), "session.json");
}

export class FileSecretStore implements SecretStore {
  constructor(private readonly filePath = defaultSessionPath()) {}

  get path(): string {
    return this.filePath;
  }

  async save(session: StoredSession): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    // Write to a temp file and rename, so a crash never leaves a half-written session.
    const temp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(session), {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temp, 0o600);
    await rename(temp, this.filePath);
  }

  async load(): Promise<StoredSession | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return null;
      }
      throw new StoreUnreadableError("file", code ?? String(error));
    }
    try {
      return parseStoredSession(raw);
    } catch (error) {
      throw new StoreUnreadableError("file", (error as Error).message);
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

  inspect(): Promise<StoreInspection> {
    return inspectByLoading(this, "file");
  }
}
