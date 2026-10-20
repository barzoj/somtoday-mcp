import { REFRESH_SKEW_MS } from "../constants.js";
import { LoginRequiredError } from "../errors.js";
import { refreshAccessToken, type FetchFn, type TokenSet } from "./tokens.js";
import type { SecretStore, StoredSession } from "./store.js";

export class SessionManager {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private cached: StoredSession | null = null;
  private refreshInFlight: Promise<void> | null = null;

  constructor(
    private readonly store: SecretStore,
    private readonly fetchFn: FetchFn = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  async hasSession(): Promise<boolean> {
    return (await this.stored()) !== null;
  }

  async stored(): Promise<StoredSession | null> {
    if (this.cached) {
      return this.cached;
    }
    this.cached = await this.store.load();
    return this.cached;
  }

  rememberTokens(
    tokens: TokenSet,
    extras: Pick<StoredSession, "tenantUuid" | "schoolLabel">,
  ): void {
    this.accessToken = tokens.accessToken;
    this.expiresAt = this.clock() + tokens.expiresIn * 1000;
    this.cached = {
      refreshToken: tokens.refreshToken,
      clientId: tokens.clientId,
      tenantUuid: extras.tenantUuid,
      apiBaseUrl: tokens.apiBaseUrl,
      schoolLabel: extras.schoolLabel,
    };
  }

  async persist(
    tokens: TokenSet,
    extras: Pick<StoredSession, "tenantUuid" | "schoolLabel">,
  ): Promise<void> {
    this.rememberTokens(tokens, extras);
    await this.store.save(this.cached!);
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
    return stored.schoolLabel || stored.tenantUuid;
  }

  async ensureFresh(): Promise<void> {
    const stored = await this.stored();
    if (!stored) {
      throw new LoginRequiredError();
    }
    if (!this.accessToken || this.expiresAt - this.clock() < REFRESH_SKEW_MS) {
      await this.refresh();
    }
  }

  async refresh(): Promise<void> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.refreshUnlocked().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async refreshUnlocked(): Promise<void> {
    const stored = await this.stored();
    if (!stored) {
      throw new LoginRequiredError();
    }
    try {
      const tokens = await refreshAccessToken({
        refreshToken: stored.refreshToken,
        clientId: stored.clientId,
        fetchFn: this.fetchFn,
      });
      this.accessToken = tokens.accessToken;
      this.expiresAt = this.clock() + tokens.expiresIn * 1000;
      const next: StoredSession = {
        ...stored,
        refreshToken: tokens.refreshToken,
        clientId: tokens.clientId,
        apiBaseUrl: tokens.apiBaseUrl || stored.apiBaseUrl,
      };
      this.cached = next;
      if (
        tokens.refreshToken !== stored.refreshToken ||
        tokens.clientId !== stored.clientId
      ) {
        await this.store.save(next);
      }
    } catch {
      this.clearAccessToken();
      throw new LoginRequiredError();
    }
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
