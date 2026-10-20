import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { LOGIN_TIMEOUT_MS } from "../constants.js";
import { AuthFlowError } from "../errors.js";
import { logError } from "../log.js";
import {
  challengeFromVerifier,
  generateState,
  generateVerifier,
} from "../pkce.js";
import { buildAuthorizeUrl } from "./authorize.js";
import { isCallbackUrl, parseRedirectUrl } from "./redirect.js";
import {
  fetchSchools,
  matchSchools,
  schoolLabel,
  type School,
} from "./school.js";
import { exchangeAuthorizationCode } from "./tokens.js";
import type { SessionManager } from "./session.js";

export type LoginIo = {
  ask: (prompt: string) => Promise<string>;
  write: (line: string) => void;
};

export type BrowserCapture = (authorizeUrl: string) => Promise<string>;

export async function runLogin(options: {
  session: SessionManager;
  fetchFn?: typeof fetch;
  io?: LoginIo;
  captureRedirect?: BrowserCapture;
}): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const createdIo = options.io ? null : defaultIo();
  const io = options.io ?? createdIo!.io;
  try {
    await loginWithIo({ ...options, io, fetchFn });
  } finally {
    await createdIo?.close();
  }
}

async function loginWithIo(options: {
  session: SessionManager;
  fetchFn: typeof fetch;
  io: LoginIo;
  captureRedirect?: BrowserCapture;
}): Promise<void> {
  const { fetchFn, io } = options;
  const schools = await fetchSchools(fetchFn);
  const school = await pickSchool(schools, io);

  const verifier = generateVerifier();
  const challenge = challengeFromVerifier(verifier);
  const state = generateState();
  const authorizeUrl = buildAuthorizeUrl({
    codeChallenge: challenge,
    state,
    tenantUuid: school.uuid,
  });

  io.write(
    "Opening a headed Chromium window. Type your password there, not here.",
  );
  io.write("If Chromium is missing: npx playwright install chromium");

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
      tenantUuid: school.uuid,
      fetchFn,
    });
    await options.session.persist(tokens, {
      tenantUuid: school.uuid,
      schoolLabel: schoolLabel(school),
    });
    io.write(
      "Login stored. You can close this terminal and use the MCP server.",
    );
  } finally {
    wipe(code);
    wipe(verifier);
  }
}

async function pickSchool(schools: School[], io: LoginIo): Promise<School> {
  for (;;) {
    const query = (await io.ask("School name: ")).trim();
    const matches = matchSchools(schools, query);
    if (matches.length === 1) {
      const school = matches[0]!;
      io.write(`Matched: ${schoolLabel(school)}`);
      return school;
    }
    if (matches.length === 0) {
      io.write("No school matched. Try a more specific name.");
      continue;
    }
    io.write("Several schools matched:");
    for (const school of matches.slice(0, 12)) {
      io.write(`- ${schoolLabel(school)}`);
    }
    io.write("Ask again with a more specific name.");
  }
}

function defaultIo(): { io: LoginIo; close: () => Promise<void> } {
  const rl = createInterface({ input, output });
  return {
    io: {
      ask: (prompt) => rl.question(prompt),
      write: (line) => {
        console.log(line);
      },
    },
    close: async () => {
      rl.close();
    },
  };
}

function wipe(value: string): void {
  // Best-effort: overwrite the string binding's content is not possible in
  // JS, but callers drop the last reference immediately after this.
  void value.length;
}

export async function captureWithPlaywright(
  authorizeUrl: string,
): Promise<string> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    const redirect = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AuthFlowError("Login timed out after 5 minutes"));
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
    await browser.close().catch((error: unknown) => {
      logError("browser close failed", error);
    });
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
