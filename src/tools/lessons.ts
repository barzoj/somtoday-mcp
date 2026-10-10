import { loadChildren, resolveChild } from "../api/account.js";
import {
  fetchHolidays,
  fetchWeekLessons,
  filterLessonsForDate,
  holidaysOnDate,
} from "../api/lessons.js";
import { tomorrowAmsterdam } from "../dates.js";
import { requireSession, type ToolContext } from "./context.js";
import { jsonResult, withToolErrors, type ToolResult } from "./result.js";

export async function lessonsTool(
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
    if (!child.roosterBekijkenAan) {
      return jsonResult({
        available: false,
        reason: "roosterBekijkenAan is false",
        leerlingId: child.leerlingId,
        date,
      });
    }
    const [weekItems, holidays] = await Promise.all([
      fetchWeekLessons(ctx.client, child.leerlingId, date),
      fetchHolidays(ctx.client),
    ]);
    const onHoliday = holidaysOnDate(holidays, date);
    return jsonResult({
      leerlingId: child.leerlingId,
      date,
      holiday: onHoliday.length > 0,
      holidays: onHoliday.map((item) => item.naam).filter(Boolean),
      lessons: filterLessonsForDate(weekItems, date),
    });
  });
}
