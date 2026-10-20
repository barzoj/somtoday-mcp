import {
  CLAIMS,
  DEFAULT_API_BASE,
  NATIVE_CLIENT_ID,
  REDIRECT_URI,
  SCOPE,
  SESSION_NO,
  TOKEN_TIMEOUT_MS,
  TOKEN_URL,
} from "../constants.js";
import {
  AuthFlowError,
  AuthNetworkError,
  RefreshRejectedError,
} from "../errors.js";
import { logError } from "../log.js";
import { isJwtString } from "../pkce.js";

export type FetchFn = typeof fetch;

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  apiBaseUrl: string;
  clientId: string;
  idToken?: string;
};

type TokenJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  somtoday_api_url?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

export function encodeForm(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

export async function exchangeAuthorizationCode(options: {
  code: string;
  verifier: string;
  tenantUuid: string;
  fetchFn?: FetchFn;
}): Promise<TokenSet> {
  const fetchFn = options.fetchFn ?? fetch;
  const baseFields = {
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: REDIRECT_URI,
    code_verifier: options.verifier,
    client_id: NATIVE_CLIENT_ID,
    scope: SCOPE,
    claims: CLAIMS,
  };

  const first = await postToken(fetchFn, baseFields);
  if (first.ok) {
    return readTokenSet(first.json, NATIVE_CLIENT_ID);
  }

  logError(
    `token exchange HTTP ${first.status} error=${first.json.error ?? ""}`,
  );

  const retry = await postToken(fetchFn, {
    ...baseFields,
    session: SESSION_NO,
    tenant_uuid: options.tenantUuid,
  });
  if (!retry.ok) {
    logError(
      `token exchange retry HTTP ${retry.status} error=${retry.json.error ?? ""}`,
    );
    throw new AuthFlowError(
      `Token exchange failed: HTTP ${retry.status} ${retry.json.error ?? ""}`.trim(),
    );
  }
  return readTokenSet(retry.json, NATIVE_CLIENT_ID);
}

export async function refreshAccessToken(options: {
  refreshToken: string;
  clientId: string;
  fetchFn?: FetchFn;
}): Promise<TokenSet> {
  const fetchFn = options.fetchFn ?? fetch;
  // One attempt with the client id that issued the token. Refresh tokens are
  // single-use, so retrying the same token with another client id can only
  // burn it (the old legacy-UUID fallback was removed for that reason).
  const result = await postToken(fetchFn, {
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.clientId,
    scope: SCOPE,
    claims: CLAIMS,
  });
  if (result.ok) {
    return readTokenSet(result.json, options.clientId, options.refreshToken);
  }
  logError(`refresh HTTP ${result.status} error=${result.json.error ?? ""}`);
  if (result.status >= 500) {
    throw new AuthNetworkError(`token endpoint HTTP ${result.status}`);
  }
  throw new RefreshRejectedError(result.status, result.json.error);
}

async function postToken(
  fetchFn: FetchFn,
  fields: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: TokenJson }> {
  let response: Response;
  try {
    response = await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encodeForm(fields),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AuthNetworkError(
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error),
    );
  }
  const json = (await response.json().catch(() => ({}))) as TokenJson;
  return { ok: response.ok, status: response.status, json };
}

function readTokenSet(
  json: TokenJson,
  clientId: string,
  previousRefreshToken?: string,
): TokenSet {
  // A refresh response may omit refresh_token; then the old one stays valid.
  const refreshToken = json.refresh_token || previousRefreshToken;
  if (!json.access_token || !refreshToken || json.expires_in == null) {
    throw new AuthFlowError("Token response missing required fields");
  }
  if (json.id_token !== undefined && !isJwtString(json.id_token)) {
    throw new AuthFlowError("id_token is not a JWT string");
  }
  return {
    accessToken: json.access_token,
    refreshToken,
    expiresIn: json.expires_in,
    apiBaseUrl: resolveApiBaseUrl(json.somtoday_api_url),
    clientId,
    idToken: json.id_token,
  };
}

/**
 * Only send bearer tokens to Somtoday: accept `somtoday_api_url` from the
 * token response only for https hosts under somtoday.nl.
 */
export function resolveApiBaseUrl(candidate: string | undefined): string {
  if (!candidate) {
    return DEFAULT_API_BASE;
  }
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol === "https:" &&
      (host === "somtoday.nl" || host.endsWith(".somtoday.nl"))
    ) {
      return candidate.replace(/\/$/, "");
    }
  } catch {
    // fall through
  }
  logError("ignoring somtoday_api_url outside https://*.somtoday.nl");
  return DEFAULT_API_BASE;
}
