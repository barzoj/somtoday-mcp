import type { ApiClient } from "../api/client.js";
import type { AuthStatus, SessionManager } from "../auth/session.js";
import { redact } from "../log.js";
import type { ToolContext } from "./context.js";
import { jsonResult, type ToolResult } from "./result.js";

export type AuthCheck = {
  refresh: "ok" | "failed";
  refreshError?: string;
  accountMe?: number | "failed";
  accountMeError?: string;
};

/**
 * Session diagnostics. With `check`, renews the access token and calls
 * `GET /account/me` once to prove the session works end to end.
 */
export async function collectAuthStatus(
  session: SessionManager,
  client: ApiClient,
  check = false,
): Promise<AuthStatus & { check?: AuthCheck }> {
  if (!check) {
    return session.status();
  }
  const result: AuthCheck = { refresh: "ok" };
  try {
    session.clearAccessToken();
    await session.refresh();
  } catch (error) {
    result.refresh = "failed";
    result.refreshError = redact(errorText(error));
  }
  if (result.refresh === "ok") {
    try {
      const response = await client.get("/account/me");
      result.accountMe = response.status;
    } catch (error) {
      result.accountMe = "failed";
      result.accountMeError = redact(errorText(error));
    }
  }
  return { ...(await session.status()), check: result };
}

export async function authStatusTool(
  ctx: ToolContext,
  args: { check?: boolean },
): Promise<ToolResult> {
  return jsonResult(
    await collectAuthStatus(ctx.session, ctx.client, args.check ?? false),
  );
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const reason = (error as { reason?: string }).reason;
    return reason ? `${error.message} (${reason})` : error.message;
  }
  return String(error);
}
