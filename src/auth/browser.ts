import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, BrowserType, Page } from "playwright";
import { logError } from "../log.js";

/**
 * Browser channels tried for the login window, in order: an installed Google
 * Chrome, then Microsoft Edge, then Playwright's bundled Chromium. A regular
 * installed browser passes Somtoday's Cloudflare check more reliably than the
 * bundled build.
 */
export const LOGIN_CHANNELS = ["chrome", "msedge", undefined] as const;

export type LoginBrowser = {
  page: Page;
  /** "chrome", "msedge" or "chromium" (bundled). */
  channel: string;
  close: () => Promise<void>;
};

type Launcher = Pick<BrowserType, "launchPersistentContext">;

/** Only the plain automation markers are switched off; no stealth or fingerprint changes. */
export const LAUNCH_OPTIONS = {
  headless: false,
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled"],
  viewport: null,
} as const;

export async function launchLoginBrowser(
  launcher?: Launcher,
  channels: readonly (string | undefined)[] = LOGIN_CHANNELS,
): Promise<LoginBrowser> {
  const chromium = launcher ?? (await import("playwright")).chromium;
  // A fresh, throw-away profile per login (removed again on close).
  const profileDir = await mkdtemp(join(tmpdir(), "somtoday-mcp-login-"));
  const errors: string[] = [];
  for (const channel of channels) {
    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(profileDir, {
        ...LAUNCH_OPTIONS,
        ignoreDefaultArgs: [...LAUNCH_OPTIONS.ignoreDefaultArgs],
        args: [...LAUNCH_OPTIONS.args],
        ...(channel ? { channel } : {}),
      });
    } catch (error) {
      errors.push(`${channel ?? "chromium"}: ${firstLine(error)}`);
      continue;
    }
    const page = context.pages()[0] ?? (await context.newPage());
    return {
      page,
      channel: channel ?? "chromium",
      close: async () => {
        await context.close().catch((error: unknown) => {
          logError("browser close failed", error);
        });
        await rm(profileDir, { recursive: true, force: true }).catch(() => {});
      },
    };
  }
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  throw new Error(
    `No browser could be started (${errors.join("; ")}). Install Google Chrome, or run: npx playwright install chromium`,
  );
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0]?.slice(0, 200) ?? "";
}
