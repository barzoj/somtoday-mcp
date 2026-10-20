import { launchLoginBrowser } from "./browser.js";
import { API_PREFIX, LOGIN_TIMEOUT_MS } from "../constants.js";
import { AuthFlowError } from "../errors.js";
import { userAgent } from "../packageVersion.js";
import {
  challengeFromVerifier,
  generateState,
  generateVerifier,
} from "../pkce.js";
import { buildAuthorizeUrl } from "./authorize.js";
import { isCallbackUrl, parseRedirectUrl } from "./redirect.js";
import { exchangeAuthorizationCode, type TokenSet } from "./tokens.js";
import type { SessionManager } from "./session.js";

export type LoginIo = {
  write: (line: string) => void;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BrowserCapture = (authorizeUrl: string) => Promise<string>;

export async function runLogin(options: {
  session: SessionManager;
  fetchFn?: typeof fetch;
  io?: LoginIo;
  captureRedirect?: BrowserCapture;
  /**
   * Optional tenant UUID to skip Somtoday's school picker. Without it the
   * login page shows its own school search, like the official app.
   */
  schoolUuid?: string;
}): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const io = options.io ?? { write: (line: string) => console.log(line) };
  await loginWithIo({ ...options, io, fetchFn });
}

async function loginWithIo(options: {
  session: SessionManager;
  fetchFn: typeof fetch;
  io: LoginIo;
  captureRedirect?: BrowserCapture;
  schoolUuid?: string;
}): Promise<void> {
  const { fetchFn, io } = options;
  const schoolUuid = options.schoolUuid?.trim() || undefined;
  if (schoolUuid && !UUID_RE.test(schoolUuid)) {
    throw new AuthFlowError("--school-uuid must be a UUID");
  }

  const verifier = generateVerifier();
  const challenge = challengeFromVerifier(verifier);
  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl({
    codeChallenge: challenge,
    state,
    tenantUuid: schoolUuid,
  });

  io.write(
    schoolUuid
      ? "Opening a browser window. Type your password there, not here."
      : "Opening a browser window. Search for your school and sign in there; never type your password here.",
  );
  io.write(
    "Uses your installed Google Chrome or Edge when present, otherwise Playwright Chromium (npx playwright install chromium).",
  );

  const capture = options.captureRedirect ?? captureWithPlaywright;
  let redirectUrl: string;
  try {
    redirectUrl = await capture(authorizeUrl);
  } finally {
    // verifier/code wiped after exchange below
  }

  const parsed = parseRedirectUrl(redirectUrl);
  if (!parsed.code) {
    wipe(verifier);
    throw new AuthFlowError("Redirect had no authorization code");
  }
  if (parsed.state !== state) {
    wipe(verifier);
    wipe(parsed.code);
    throw new AuthFlowError("OAuth state mismatch");
  }

  const code = parsed.code;
  try {
    const tokens = await exchangeAuthorizationCode({
      code,
      verifier,
      tenantUuid: schoolUuid,
      fetchFn,
    });
    const label =
      tokens.schoolName ?? (await schoolNameFromApi(tokens, fetchFn));
    await options.session.persist(tokens, {
      tenantUuid: tokens.tenantUuid ?? schoolUuid,
      schoolLabel: label ?? "Somtoday",
    });
    if (label) io.write(`School: ${label}`);
    io.write(
      "Login stored. You can close this terminal and use the MCP server.",
    );
  } finally {
    wipe(code);
    wipe(verifier);
  }
}

/** Best effort: school name from the parent's school data, for display only. */
async function schoolNameFromApi(
  tokens: TokenSet,
  fetchFn: typeof fetch,
): Promise<string | undefined> {
  try {
    const response = await fetchFn(
      `${tokens.apiBaseUrl}${API_PREFIX}/leerlingen/verzorger/schoolgegevens`,
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          Accept: "application/vnd.topicus.platinum+json",
          "User-Agent": userAgent(),
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) return undefined;
    const body = (await response.json()) as unknown;
    const first = Array.isArray(body)
      ? (body[0] as Record<string, unknown> | undefined)
      : undefined;
    const name = first?.instellingsnaam;
    if (typeof name !== "string" || !name.trim()) return undefined;
    const plaats = typeof first?.plaats === "string" ? first.plaats : "";
    return plaats ? `${name.trim()} (${plaats})` : name.trim();
  } catch {
    return undefined;
  }
}

function wipe(value: string): void {
  // Best-effort: overwrite the string binding's content is not possible in
  // JS, but callers drop the last reference immediately after this.
  void value.length;
}

export async function captureWithPlaywright(
  authorizeUrl: string,
): Promise<string> {
  const browser = await launchLoginBrowser();
  const page = browser.page;

  try {
    const redirect = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new AuthFlowError(
            `Login timed out after ${LOGIN_TIMEOUT_MS / 60_000} minutes`,
          ),
        );
      }, LOGIN_TIMEOUT_MS);

      const consider = (url: string) => {
        if (!isCallbackUrl(url)) {
          return;
        }
        clearTimeout(timer);
        resolve(url);
      };

      page.on("request", (request) => consider(request.url()));
      page.on("requestfailed", (request) => consider(request.url()));
    });

    await page.goto(authorizeUrl, { waitUntil: "domcontentloaded" });
    return await redirect;
  } finally {
    await browser.close();
  }
}

export function assertNoPasswordArgs(argv: string[]): void {
  const banned = ["--password", "-p", "--passwd"];
  if (
    argv.some((arg) => banned.includes(arg) || arg.startsWith("--password="))
  ) {
    throw new AuthFlowError("Passwords are not accepted on the command line");
  }
}
