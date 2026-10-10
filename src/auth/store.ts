export type StoredSession = {
  refreshToken: string;
  clientId: string;
  tenantUuid: string;
  apiBaseUrl: string;
  schoolLabel: string;
};

export interface SecretStore {
  save(session: StoredSession): Promise<void>;
  load(): Promise<StoredSession | null>;
  delete(): Promise<void>;
}
