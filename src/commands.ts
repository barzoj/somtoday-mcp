import { ApiClient } from "./api/client.js";
import type { SessionManager } from "./auth/session.js";
import { collectAuthStatus } from "./tools/auth-status.js";

export async function runStatus(
  session: SessionManager,
  check: boolean,
  write: (line: string) => void = console.log,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const status = await collectAuthStatus(
    session,
    new ApiClient(session, fetchFn),
    check,
  );
  write(JSON.stringify(status, null, 2));
  return status.loggedIn && (!status.check || status.check.accountMe === 200);
}

export async function runLogout(
  session: SessionManager,
  write: (line: string) => void = console.log,
): Promise<void> {
  await session.logout();
  write(
    "Stored Somtoday session deleted from this computer. Run `npx somtoday-mcp login` to sign in again.",
  );
}
