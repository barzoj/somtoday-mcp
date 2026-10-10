#!/usr/bin/env node
import { assertNoPasswordArgs, runLogin } from "./auth/login.js";
import { createDefaultStore } from "./auth/keychain-store.js";
import { SessionManager } from "./auth/session.js";
import { logError } from "./log.js";
import { startStdioServer } from "./server.js";

async function main(): Promise<void> {
  assertNoPasswordArgs(process.argv.slice(2));
  const command = process.argv[2];

  if (command === "login") {
    const session = new SessionManager(createDefaultStore());
    await runLogin({ session });
    return;
  }

  await startStdioServer();
}

main().catch((error: unknown) => {
  logError(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
