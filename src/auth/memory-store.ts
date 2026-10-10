import type { SecretStore, StoredSession } from "./store.js";

export class MemorySecretStore implements SecretStore {
  private session: StoredSession | null = null;

  async save(session: StoredSession): Promise<void> {
    this.session = { ...session };
  }

  async load(): Promise<StoredSession | null> {
    return this.session ? { ...this.session } : null;
  }

  async delete(): Promise<void> {
    this.session = null;
  }
}
