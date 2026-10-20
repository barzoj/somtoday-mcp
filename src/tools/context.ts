import { ApiClient } from "../api/client.js";
import type { SessionManager } from "../auth/session.js";
import { LOGIN_INSTRUCTION } from "../constants.js";
import { LoginRequiredError } from "../errors.js";
import { errorResult, type ToolResult } from "./result.js";

export type ToolContext = {
  session: SessionManager;
  client: ApiClient;
};

export function createToolContext(
  session: SessionManager,
  fetchFn: typeof fetch = fetch,
): ToolContext {
  return {
    session,
    client: new ApiClient(session, fetchFn),
  };
}

export async function requireSession(
  ctx: ToolContext,
): Promise<ToolResult | null> {
  if (!(await ctx.session.hasSession())) {
    return errorResult(LOGIN_INSTRUCTION);
  }
  return null;
}

export function loginRequired(): never {
  throw new LoginRequiredError();
}
