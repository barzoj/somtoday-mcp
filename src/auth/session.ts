import { REFRESH_SKEW_MS } from "../constants.js";
import {
  AuthNetworkError,
  LoginRequiredError,
  RefreshRejectedError,
  SessionUnreadableError,
} from "../errors.js";
import { logError } from "../log.js";
import { NoopLock, type SessionLock } from "./lock.js";
import { refreshAccessToken, type FetchFn, type TokenSet } from "./tokens.js";
import {
  StoreUnreadableError,
  type SecretStore,
  type StoreInspection,
  type StoredSession,
} from "./store.js";

export type RefreshOutcome =
  "ok" | "ok-not-persisted" | "rejected" | "network" | "unreadable" | "missing";

export type RefreshRecord = {
  at: string;
  outcome: RefreshOutcome;
  /** HTTP status of the token endpoint, when there was one. */
  status?: number;
  /** OAuth `error` code or a short description. Never a token. */
  detail?: string;
};

export type AuthStatus = {
  loggedIn: boolean;
  storage: StoreInspection["state"];
  source?: string;
  warning?: string;
  error?: string;
  school?: string;
  clientId?: string;
  apiHost?: string;
  accessTokenInMemory: boolean;
  accessTokenExpiresAt?: string;
  lastRefresh?: RefreshRecord;
  hint?: string;
};

type Extras = Pick<StoredSession, "tenantUuid" | "schoolLabel">;

export class SessionManager {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private cached: StoredSession | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private lastRefresh: RefreshRecord | undefined;
  /** Rotated session that could not be written to storage, and the token it replaced. */
  private unpersisted: { session: StoredSession; spent: string } | null = null;

  constructor(
    private readonly store: SecretStore,
    private readonly fetchFn: FetchFn = fetch,
    private readonly clock: () => number = Date.now,
    private readonly lock: SessionLock = new NoopLock(),
  ) {}

  async hasSession(): Promise<boolean> {
    return (await this.stored()) !== null;
  }

  /** Last known session for metadata (API base URL, school). Reloads while empty. */
  async stored(): Promise<StoredSession | null> {
    if (this.cached) {
      return this.cached;
    }
    this.cached = await this.loadFromStore();
    return this.cached;
  }

  /** Store a freshly issued token set (login). Verified by reading it back. */
  async persist(tokens: TokenSet, extras: Extras): Promise<void> {
    const next: StoredSession = {
      refreshToken: tokens.refreshToken,
      clientId: tokens.clientId,
      ...(extras.tenantUuid ? { tenantUuid: extras.tenantUuid } : {}),
      apiBaseUrl: tokens.apiBaseUrl,
      schoolLabel: extras.schoolLabel,
    };
    await this.lock.withLock(async () => {
      await this.store.save(next);
      const back = await this.store.load().catch(() => null);
      if (back?.refreshToken !== next.refreshToken) {
        throw new Error(
          "The new session could not be saved and read back. Run `npx somtoday-mcp status`.",
        );
      }
    });
    this.cached = next;
    this.accessToken = tokens.accessToken;
    this.expiresAt = this.clock() + tokens.expiresIn * 1000;
  }

  async getAccessToken(): Promise<string> {
    await this.ensureFresh();
    if (!this.accessToken) {
      throw new LoginRequiredError();
    }
    return this.accessToken;
  }

  async getApiBaseUrl(): Promise<string> {
    const stored = await this.stored();
    if (!stored) {
      throw new LoginRequiredError();
    }
    return stored.apiBaseUrl;
  }

  async schoolLabel(): Promise<string> {
    const stored = await this.stored();
    if (!stored) {
      throw new LoginRequiredError();
    }
    return stored.schoolLabel || stored.tenantUuid || "Somtoday";
  }

  async ensureFresh(): Promise<void> {
    if (!this.accessToken || this.expiresAt - this.clock() < REFRESH_SKEW_MS) {
      await this.refresh();
    }
  }

  /**
   * Called after the API rejected `usedToken` (401 / bare 403). If another call
   * already replaced that access token, reuse the new one instead of refreshing again.
   */
  async refreshAfterRejection(usedToken: string): Promise<void> {
    if (
      this.accessToken &&
      this.accessToken !== usedToken &&
      this.expiresAt - this.clock() >= REFRESH_SKEW_MS
    ) {
      return;
    }
    this.clearAccessToken();
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.lock
        .withLock(() => this.refreshLocked())
        .finally(() => {
          this.refreshInFlight = null;
        });
    }
    return this.refreshInFlight;
  }

  /** Runs under the cross-process lock. Always works from what is in storage now. */
  private async refreshLocked(): Promise<void> {
    let stored = await this.loadForRefresh();
    let tokens: TokenSet;
    try {
      tokens = await this.callRefresh(stored);
    } catch (error) {
      if (!(error instanceof RefreshRejectedError)) {
        throw this.fail(error);
      }
      // Another process (or a new login) may have rotated the token after we
      // read it. Re-read once and retry only if storage has a different token.
      const reread = await this.loadForRefresh().catch(() => null);
      if (!reread || reread.refreshToken === stored.refreshToken) {
        throw this.fail(error);
      }
      stored = reread;
      try {
        tokens = await this.callRefresh(stored);
      } catch (retryError) {
        throw this.fail(retryError);
      }
    }

    const next: StoredSession = {
      ...stored,
      refreshToken: tokens.refreshToken,
      clientId: tokens.clientId,
      apiBaseUrl: tokens.apiBaseUrl || stored.apiBaseUrl,
    };
    // Persist the rotated refresh token BEFORE using the new access token, so
    // a crash after this point never leaves only the spent token in storage.
    const persisted = await this.persistRotated(stored, next);
    this.unpersisted = persisted
      ? null
      : { session: next, spent: stored.refreshToken };
    this.cached = next;
    this.accessToken = tokens.accessToken;
    this.expiresAt = this.clock() + tokens.expiresIn * 1000;
    this.record(persisted ? "ok" : "ok-not-persisted", {
      detail: persisted
        ? undefined
        : "new refresh token kept in memory only; storage write failed",
    });
  }

  private async callRefresh(stored: StoredSession): Promise<TokenSet> {
    return refreshAccessToken({
      refreshToken: stored.refreshToken,
      clientId: stored.clientId,
      fetchFn: this.fetchFn,
    });
  }

  private async persistRotated(
    previous: StoredSession,
    next: StoredSession,
  ): Promise<boolean> {
    if (
      next.refreshToken === previous.refreshToken &&
      next.clientId === previous.clientId &&
      next.apiBaseUrl === previous.apiBaseUrl
    ) {
      return true;
    }
    try {
      await this.store.save(next);
      const back = await this.store.load();
      if (back?.refreshToken === next.refreshToken) {
        return true;
      }
      logError("rotated refresh token did not read back from storage");
    } catch (error) {
      logError(
        `saving rotated refresh token failed: ${(error as Error).message}`,
      );
    }
    return false;
  }

  private async loadForRefresh(): Promise<StoredSession> {
    const stored = await this.loadFromStore();
    // If our last rotation could not be saved, storage still holds the spent
    // token; keep using the in-memory one until storage changes.
    if (
      this.unpersisted &&
      (!stored || stored.refreshToken === this.unpersisted.spent)
    ) {
      return this.unpersisted.session;
    }
    this.unpersisted = null;
    if (!stored) {
      this.cached = null;
      this.record("missing");
      throw new LoginRequiredError("no stored session");
    }
    return stored;
  }

  private async loadFromStore(): Promise<StoredSession | null> {
    try {
      return await this.store.load();
    } catch (error) {
      if (error instanceof StoreUnreadableError) {
        this.record("unreadable", { detail: error.message });
        throw new SessionUnreadableError(error.message);
      }
      throw error;
    }
  }

  private fail(error: unknown): Error {
    this.clearAccessToken();
    if (error instanceof RefreshRejectedError) {
      this.record("rejected", {
        status: error.status,
        detail: error.oauthError,
      });
      return new LoginRequiredError(error.message);
    }
    if (error instanceof AuthNetworkError) {
      this.record("network", { detail: error.message });
      return error;
    }
    if (
      error instanceof LoginRequiredError ||
      error instanceof SessionUnreadableError
    ) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.record("rejected", { detail: message });
    return new LoginRequiredError(message);
  }

  private record(
    outcome: RefreshOutcome,
    extra: Omit<RefreshRecord, "at" | "outcome"> = {},
  ): void {
    this.lastRefresh = {
      at: new Date(this.clock()).toISOString(),
      outcome,
      ...extra,
    };
  }

  /** Diagnostics for `status` / `auth_status`. Never includes tokens. */
  async status(): Promise<AuthStatus> {
    const inspection = await this.store.inspect();
    const base = {
      accessTokenInMemory: Boolean(this.accessToken),
      accessTokenExpiresAt: this.accessToken
        ? new Date(this.expiresAt).toISOString()
        : undefined,
      lastRefresh: this.lastRefresh,
    };
    if (inspection.state === "ok") {
      const session = inspection.session;
      let apiHost: string | undefined;
      try {
        apiHost = new URL(session.apiBaseUrl).host;
      } catch {
        apiHost = undefined;
      }
      const rejected = this.lastRefresh?.outcome === "rejected";
      return {
        loggedIn: !rejected,
        storage: "ok",
        source: inspection.source,
        warning: inspection.warning,
        school: session.schoolLabel || session.tenantUuid,
        clientId: session.clientId,
        apiHost,
        ...base,
        hint: rejected
          ? "Somtoday rejected the stored session. Run `npx somtoday-mcp login`."
          : undefined,
      };
    }
    if (inspection.state === "missing") {
      return {
        loggedIn: false,
        storage: "missing",
        warning: inspection.warning,
        ...base,
        hint: "Run `npx somtoday-mcp login` in a terminal.",
      };
    }
    return {
      loggedIn: false,
      storage: "unreadable",
      source: inspection.source,
      error: inspection.error,
      ...base,
      hint: "The stored session cannot be read. Run `npx somtoday-mcp logout`, then `npx somtoday-mcp login`. Setting SOMTODAY_MCP_DISABLE_KEYCHAIN=1 stores it in a file instead.",
    };
  }

  /** Forget the access token and delete the stored session. */
  async logout(): Promise<void> {
    await this.lock.withLock(() => this.store.delete());
    this.clearAccessToken();
    this.cached = null;
    this.unpersisted = null;
    this.lastRefresh = undefined;
  }

  clearAccessToken(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }

  seedAccessToken(token: string, expiresAt: number): void {
    this.accessToken = token;
    this.expiresAt = expiresAt;
  }
}
