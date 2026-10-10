import { loadChildren, resolveChild } from "../api/account.js";
import {
  fetchHomeworkSets,
  filterDatedHomework,
  filterHandInsForDate,
  filterWeekHomework,
  mapHomework,
} from "../api/homework.js";
import { tomorrowAmsterdam } from "../dates.js";
import { requireSession, type ToolContext } from "./context.js";
import { jsonResult, withToolErrors, type ToolResult } from "./result.js";

export async function homeworkTool(
  ctx: ToolContext,
  args: { date?: string; leerlingId?: string },
): Promise<ToolResult> {
  return withToolErrors(async () => {
    const missing = await requireSession(ctx);
    if (missing) {
      return missing;
    }
    const date = args.date ?? tomorrowAmsterdam();
    const child = resolveChild(await loadChildren(ctx.client), args.leerlingId);
    if (!child.huiswerkBekijkenAan) {
      return jsonResult({
        available: false,
        reason: "huiswerkBekijkenAan is false",
        leerlingId: child.leerlingId,
        date,
      });
    }
    const sets = await fetchHomeworkSets(ctx.client, child.leerlingId, date);
    return jsonResult({
      leerlingId: child.leerlingId,
      date,
      items: [
        ...filterDatedHomework(sets.afspraak, date).map(mapHomework),
        ...filterDatedHomework(sets.dag, date).map(mapHomework),
        ...filterWeekHomework(sets.week, date).map(mapHomework),
        ...filterHandInsForDate(sets.inlever, date).map(mapHomework),
      ],
    });
  });
}
