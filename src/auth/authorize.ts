import {
  AUTHORIZE_URL,
  CLAIMS,
  NATIVE_CLIENT_ID,
  REDIRECT_URI,
  SCOPE,
  SESSION_NO,
} from "../constants.js";

export type AuthorizeParams = {
  codeChallenge: string;
  state: string;
  tenantUuid: string;
};

export function buildAuthorizeUrl(params: AuthorizeParams): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", NATIVE_CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  url.searchParams.set("tenant_uuid", params.tenantUuid);
  url.searchParams.set("session", SESSION_NO);
  url.searchParams.set("claims", CLAIMS);
  return url.toString();
}
