import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fetchSchools } from "../../src/auth/school.js";
import {
  packageName,
  packageVersion,
  userAgent,
} from "../../src/packageVersion.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = createRequire(import.meta.url)("../../package.json") as {
  name: string;
  version: string;
};

describe("packageVersion", () => {
  it("matches package.json", () => {
    expect(packageVersion()).toBe(pkg.version);
    expect(packageName()).toBe(pkg.name);
    expect(userAgent()).toBe(`${pkg.name}/${pkg.version}`);
  });

  it("is sent as the User-Agent when fetching the school list", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response("[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await fetchSchools(fetchFn as unknown as typeof fetch).catch(() => []);
    expect(fetchFn).toHaveBeenCalled();
    const init = (fetchFn.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe(
      `${pkg.name}/${pkg.version}`,
    );
  });

  it("CLI --version prints the package.json version", () => {
    const tscJs = join(root, "node_modules", "typescript", "lib", "tsc.js");
    execFileSync(process.execPath, [tscJs, "-p", "tsconfig.build.json"], {
      cwd: root,
      stdio: "pipe",
    });
    const output = execFileSync(
      process.execPath,
      [join(root, "dist", "cli.js"), "--version"],
      { cwd: root, encoding: "utf8" },
    ).trim();
    expect(output).toBe(pkg.version);
  }, 60_000);
});
