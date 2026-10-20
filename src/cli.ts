#!/usr/bin/env node
import { setDefaultResultOrder } from "node:dns";
import { createDefaultSession } from "./auth/default-session.js";
import { assertNoPasswordArgs, runLogin } from "./auth/login.js";
import { formatError } from "./errors.js";
import { logError } from "./log.js";
import { packageVersion } from "./packageVersion.js";
import { startStdioServer } from "./server.js";
import { runLogout, runStatus } from "./commands.js";

setDefaultResultOrder("ipv4first");

const HELP = `Usage: somtoday-mcp [command]

  (no command)      start the MCP stdio server
  login             sign in to Somtoday in a browser window
  status [--check]  show where the session is stored and the last renewal;
                    --check also renews the token and calls the API once
  logout            delete the stored session from this computer
  --version, -v     print the version
  --help, -h        show this help`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  assertNoPasswordArgs(args);
  const command = args[0];

  switch (command) {
    case "--version":
    case "-v":
      console.log(packageVersion());
      return;
    case "--help":
    case "-h":
    case "help":
      console.log(HELP);
      return;
    case "login":
      await runLogin({ session: createDefaultSession() });
      return;
    case "status": {
      const ok = await runStatus(
        createDefaultSession(),
        args.includes("--check"),
      );
      if (!ok) process.exitCode = 1;
      return;
    }
    case "logout":
      await runLogout(createDefaultSession());
      return;
    case undefined:
      await startStdioServer();
      return;
    default:
      logError(`Unknown command: ${command}\n\n${HELP}`);
      process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  logError(formatError(error));
  process.exitCode = 1;
});
