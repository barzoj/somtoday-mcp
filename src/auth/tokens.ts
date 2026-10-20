import {
  DEFAULT_API_BASE,
  FALLBACK_CLIENT_ID,
  NATIVE_CLIENT_ID,
  REDIRECT_URI,
  SCOPE,
  SESSION_NO,
  TOKEN_URL,
} from "../constants.js";
import { AuthFlowError } from "../errors.js";
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
  const first = await postToken(fetchFn, {
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.clientId,
    scope: SCOPE,
  });
  if (first.ok) {
    return readTokenSet(first.json, options.clientId);
  }

  const invalidClient = isInvalidClient(first.status, first.json.error);
  logError(`refresh HTTP ${first.status} error=${first.json.error ?? ""}`);

  if (invalidClient && options.clientId !== FALLBACK_CLIENT_ID) {
    const fallback = await postToken(fetchFn, {
      grant_type: "refresh_token",
      refresh_token: options.refreshToken,
      client_id: FALLBACK_CLIENT_ID,
      scope: SCOPE,
    });
    if (fallback.ok) {
      return readTokenSet(fallback.json, FALLBACK_CLIENT_ID);
    }
    logError(
      `refresh fallback HTTP ${fallback.status} error=${fallback.json.error ?? ""}`,
    );
    throw new AuthFlowError(
      `Refresh failed: HTTP ${fallback.status} ${fallback.json.error ?? ""}`.trim(),
    );
  }

  throw new AuthFlowError(
    `Refresh failed: HTTP ${first.status} ${first.json.error ?? ""}`.trim(),
  );
}

function isInvalidClient(status: number, error?: string): boolean {
  if (!error) {
    return status === 401;
  }
  return /invalid_client/i.test(error);
}

async function postToken(
  fetchFn: FetchFn,
  fields: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: TokenJson }> {
  const response = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(fields),
  });
  const json = (await response.json().catch(() => ({}))) as TokenJson;
  return { ok: response.ok, status: response.status, json };
}

function readTokenSet(json: TokenJson, clientId: string): TokenSet {
  if (!json.access_token || !json.refresh_token || json.expires_in == null) {
    throw new AuthFlowError("Token response missing required fields");
  }
  if (json.id_token !== undefined && !isJwtString(json.id_token)) {
    throw new AuthFlowError("id_token is not a JWT string");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    apiBaseUrl: json.somtoday_api_url ?? DEFAULT_API_BASE,
    clientId,
    idToken: json.id_token,
  };
}
