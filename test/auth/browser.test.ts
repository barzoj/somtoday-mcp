import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { launchLoginBrowser } from "../../src/auth/browser.js";

function fakeLauncher(failing: Array<string | undefined>) {
  const page = { fake: "page" };
  const close = vi.fn(async () => {});
  const calls: Array<{ dir: string; options: Record<string, unknown> }> = [];
  const launcher = {
    launchPersistentContext: vi.fn(
      async (dir: string, options: Record<string, unknown>) => {
        calls.push({ dir, options });
        if (failing.includes(options.channel as string | undefined)) {
          throw new Error(
            `Chromium distribution '${String(options.channel)}' is not found\nmore`,
          );
        }
        return { pages: () => [page], newPage: async () => page, close };
      },
    ),
  };
  return { launcher, calls, close, page };
}

describe("login browser", () => {
  it("prefers installed Chrome with only the automation markers removed", async () => {
    const { launcher, calls, close } = fakeLauncher([]);
    const browser = await launchLoginBrowser(launcher as never);
    expect(browser.channel).toBe("chrome");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.options).toMatchObject({
      headless: false,
      channel: "chrome",
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled"],
    });
    expect(calls[0]?.dir).toMatch(/somtoday-mcp-login-/);
    expect(existsSync(calls[0]!.dir)).toBe(true);
    await browser.close();
    expect(close).toHaveBeenCalled();
    expect(existsSync(calls[0]!.dir)).toBe(false);
  });

  it("falls back to Edge, then bundled Chromium", async () => {
    const { launcher, calls } = fakeLauncher(["chrome", "msedge"]);
    const browser = await launchLoginBrowser(launcher as never);
    expect(calls.map((call) => call.options.channel)).toEqual([
      "chrome",
      "msedge",
      undefined,
    ]);
    expect(browser.channel).toBe("chromium");
    await browser.close();
  });

  it("explains when nothing can start and cleans the profile", async () => {
    const { launcher, calls } = fakeLauncher(["chrome", "msedge", undefined]);
    await expect(launchLoginBrowser(launcher as never)).rejects.toThrow(
      /Install Google Chrome/,
    );
    expect(existsSync(calls[0]!.dir)).toBe(false);
  });
});
