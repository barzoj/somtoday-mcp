import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tools that save files (download_attachment) must never write to ~/Downloads in tests.
process.env.SOMTODAY_MCP_DOWNLOAD_DIR = mkdtempSync(
  join(tmpdir(), "somtoday-mcp-test-"),
);

const BLOCKED =
  /inloggen\.somtoday\.nl|api\.somtoday\.nl|servers\.somtoday\.nl/;

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (BLOCKED.test(url)) {
    throw new Error(`Network forbidden in tests: ${url}`);
  }
  return originalFetch(input, init);
};
