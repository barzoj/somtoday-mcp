import {
  hasRight,
  loadChildren,
  resolveChild,
  type ChildAccess,
} from "../api/account.js";
import { requireSession, type ToolContext } from "./context.js";
import { jsonResult, withToolErrors, type ToolResult } from "./result.js";

/**
 * Shared frame for per-child tools: session check, child resolution, the
 * school's section switch (`right`), error mapping, JSON output.
 */
export async function childTool(
  ctx: ToolContext,
  leerlingId: string | undefined,
  right: string | undefined,
  run: (child: ChildAccess) => Promise<unknown>,
): Promise<ToolResult> {
  return withToolErrors(async () => {
    const missing = await requireSession(ctx);
    if (missing) {
      return missing;
    }
    const child = resolveChild(await loadChildren(ctx.client), leerlingId);
    if (right && !hasRight(child, right)) {
      return jsonResult({
        available: false,
        reason: `${right} is false: the school does not show this section`,
        leerlingId: child.leerlingId,
      });
    }
    return jsonResult({
      leerlingId: child.leerlingId,
      ...((await run(child)) as object),
    });
  });
}

/** Same frame for account-level tools that do not need a child. */
export async function accountTool(
  ctx: ToolContext,
  run: () => Promise<unknown>,
): Promise<ToolResult> {
  return withToolErrors(async () => {
    const missing = await requireSession(ctx);
    if (missing) {
      return missing;
    }
    return jsonResult(await run());
  });
}
