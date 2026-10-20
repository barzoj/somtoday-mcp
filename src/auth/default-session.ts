import { join } from "node:path";
import { configDir } from "./file-store.js";
import { createDefaultStore } from "./keychain-store.js";
import { FileLock } from "./lock.js";
import { SessionManager } from "./session.js";

export function sessionLockPath(): string {
  return join(configDir(), "session.lock");
}

/** Session backed by the keychain/file store, with a cross-process refresh lock. */
export function createDefaultSession(): SessionManager {
  return new SessionManager(
    createDefaultStore(),
    fetch,
    Date.now,
    new FileLock(sessionLockPath()),
  );
}
