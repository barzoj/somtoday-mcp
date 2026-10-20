#!/usr/bin/env node
import { setDefaultResultOrder } from "node:dns";
import { assertNoPasswordArgs, runLogin } from "./auth/login.js";
import { createDefaultStore } from "./auth/keychain-store.js";
import { SessionManager } from "./auth/session.js";
import { formatError } from "./errors.js";
import { logError } from "./log.js";
import { packageVersion } from "./packageVersion.js";
import { startStdioServer } from "./server.js";

setDefaultResultOrder("ipv4first");

async function main(): Promise<void> {
  assertNoPasswordArgs(process.argv.slice(2));
  const command = process.argv[2];

  if (command === "--version" || command === "-v") {
    console.log(packageVersion());
    return;
  }

  if (command === "login") {
    const session = new SessionManager(createDefaultStore());
    await runLogin({ session });
    return;
  }

  await startStdioServer();
}

main().catch((error: unknown) => {
  logError(formatError(error));
  process.exitCode = 1;
});
