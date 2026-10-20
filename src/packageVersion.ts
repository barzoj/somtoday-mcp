import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

interface PackageJson {
  name: string;
  version: string;
}

function readPackageJson(): PackageJson {
  // Resolves from both src/ (tests) and dist/ (published package).
  return require("../package.json") as PackageJson;
}

/** Installed package version from package.json. */
export function packageVersion(): string {
  return readPackageJson().version;
}

export function packageName(): string {
  return readPackageJson().name;
}

export function userAgent(): string {
  return `${packageName()}/${packageVersion()}`;
}
