export const LOGIN_INSTRUCTION = "run `npx somtoday-mcp login` in a terminal";

export const NATIVE_CLIENT_ID = "somtoday-leerling-native";

export const REDIRECT_URI =
  "somtoday://nl.topicus.somtoday.leerling/oauth/callback";

export const AUTHORIZE_URL = "https://inloggen.somtoday.nl/oauth2/authorize";
export const TOKEN_URL = "https://inloggen.somtoday.nl/oauth2/token";

export const DEFAULT_API_BASE = "https://api.somtoday.nl";
export const API_PREFIX = "/rest/v1";

export const ACCEPT = "application/vnd.topicus.platinum+json; charset=utf-8";
export const ACCEPT_JSON = "application/json";

export const KEYCHAIN_SERVICE = "somtoday-mcp";
export const KEYCHAIN_ACCOUNT = "session";

export const SCOPE = "openid";
/** Same `claims` request the official Somtoday app sends on authorize, token, and refresh. */
export const CLAIMS = JSON.stringify({
  id_token: {
    given_name: null,
    leerlingen: null,
    orgname: null,
    affiliation: { values: ["student", "parent/guardian"] },
  },
});
export const SESSION_NO = "no_session";

export const REFRESH_SKEW_MS = 60_000;
export const TOKEN_TIMEOUT_MS = 20_000;
export const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export const TIMEZONE = "Europe/Amsterdam";

export const HOMEWORK_ADDITIONALS = [
  "leerlingen",
  "swigemaaktVinkjes",
  "lesgroep",
  "leerlingenMetInleveringStatus",
  "leerlingProjectgroep",
  "studiewijzerId",
] as const;

export const GRADE_TYPES = [
  "Toetskolom",
  "DeeltoetsKolom",
  "Werkstukcijferkolom",
  "Advieskolom",
] as const;

export const GRADE_ADDITIONALS = [
  "vaknaam",
  "resultaatkolom",
  "naamalternatiefniveau",
  "vakuuid",
  "lichtinguuid",
] as const;

export const GRADE_SORT = "desc-geldendResultaatCijferInvoer";
export const GRADE_CAP = 30;

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_TEXT = 100_000;
export const ATTACHMENT_TIMEOUT_MS = 30_000;
export const ATTACHMENT_MAX_REDIRECTS = 5;
/** Extra attachment hosts (comma-separated, exact host or `.suffix`), e.g. a school's file CDN. */
export const ATTACHMENT_HOSTS_ENV = "SOMTODAY_MCP_ATTACHMENT_HOSTS";
