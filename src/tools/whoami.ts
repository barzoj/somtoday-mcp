import { describeChildren, loadChildren } from "../api/account.js";
import { requireSession, type ToolContext } from "./context.js";
import { jsonResult, withToolErrors, type ToolResult } from "./result.js";

export async function whoamiTool(ctx: ToolContext): Promise<ToolResult> {
  return withToolErrors(async () => {
    const missing = await requireSession(ctx);
    if (missing) {
      return missing;
    }
    const [school, children] = await Promise.all([
      ctx.session.schoolLabel(),
      loadChildren(ctx.client),
    ]);
    return jsonResult({
      school,
      children: describeChildren(children),
    });
  });
}
