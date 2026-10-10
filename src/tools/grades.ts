import { loadChildren, resolveChild } from "../api/account.js";
import { fetchAverages, fetchGrades } from "../api/grades.js";
import { requireSession, type ToolContext } from "./context.js";
import { jsonResult, withToolErrors, type ToolResult } from "./result.js";

export async function gradesTool(
  ctx: ToolContext,
  args: { leerlingId?: string },
): Promise<ToolResult> {
  return withToolErrors(async () => {
    const missing = await requireSession(ctx);
    if (missing) {
      return missing;
    }
    const child = resolveChild(await loadChildren(ctx.client), args.leerlingId);
    if (!child.cijfersBekijkenAan) {
      return jsonResult({
        available: false,
        reason: "cijfersBekijkenAan is false",
        leerlingId: child.leerlingId,
      });
    }
    const [grades, averages] = await Promise.all([
      fetchGrades(ctx.client, child.leerlingId),
      fetchAverages(ctx.client, child.leerlingId),
    ]);
    return jsonResult({
      leerlingId: child.leerlingId,
      shown: grades.shown,
      total: grades.total,
      items: grades.items,
      averages,
    });
  });
}
