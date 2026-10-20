export type StoredSession = {
  refreshToken: string;
  clientId: string;
  /** Unknown when the school was picked in Somtoday's own login page and the token response had no tenant. */
  tenantUuid?: string;
  apiBaseUrl: string;
  schoolLabel: string;
};

export type StoreSource = "keychain" | "file" | "memory";

/**
 * What a store found, without exposing secrets in messages.
 * - `ok`: a usable session; `warning` explains a problem that was worked around.
 * - `missing`: nothing stored.
 * - `unreadable`: something is stored but cannot be read or parsed.
 */
export type StoreInspection =
  | {
      state: "ok";
      source: StoreSource;
      session: StoredSession;
      warning?: string;
    }
  | { state: "missing"; warning?: string }
  | { state: "unreadable"; source: StoreSource; error: string };

export interface SecretStore {
  save(session: StoredSession): Promise<void>;
  /** Returns null when nothing is stored; throws StoreUnreadableError when a stored item cannot be read. */
  load(): Promise<StoredSession | null>;
  delete(): Promise<void>;
  inspect(): Promise<StoreInspection>;
}

export class StoreUnreadableError extends Error {
  constructor(
    readonly source: StoreSource,
    detail: string,
  ) {
    super(`Stored session (${source}) is unreadable: ${detail}`);
    this.name = "StoreUnreadableError";
  }
}

/** Parse and validate a serialized session. Throws on anything unusable. */
export function parseStoredSession(raw: string): StoredSession {
  let parsed: Partial<StoredSession>;
  try {
    parsed = JSON.parse(raw) as Partial<StoredSession>;
  } catch {
    throw new Error("not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("not a JSON object");
  }
  const missing = (["refreshToken", "clientId", "apiBaseUrl"] as const).filter(
    (key) => typeof parsed[key] !== "string" || !parsed[key],
  );
  if (missing.length > 0) {
    throw new Error(`missing fields: ${missing.join(", ")}`);
  }
  return {
    refreshToken: parsed.refreshToken!,
    clientId: parsed.clientId!,
    ...(typeof parsed.tenantUuid === "string" && parsed.tenantUuid
      ? { tenantUuid: parsed.tenantUuid }
      : {}),
    apiBaseUrl: parsed.apiBaseUrl!,
    schoolLabel: parsed.schoolLabel || parsed.tenantUuid || "Somtoday",
  };
}

export async function inspectByLoading(
  store: Pick<SecretStore, "load">,
  source: StoreSource,
): Promise<StoreInspection> {
  try {
    const session = await store.load();
    return session ? { state: "ok", source, session } : { state: "missing" };
  } catch (error) {
    return {
      state: "unreadable",
      source,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
