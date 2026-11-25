import { fetchSchedule } from "../api/schedule.js";
import { resolveRange, todayAmsterdam } from "../dates.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { HOMEWORK_MAX_DAYS } from "./homework.js";
import type { ToolResult } from "./result.js";

export const SCHEDULE_DEFAULT_DAYS = 7;
/** Same ceiling as homework: week-batched fetches cover a school year. */
export const SCHEDULE_MAX_DAYS = HOMEWORK_MAX_DAYS;

export async function scheduleTool(
  ctx: ToolContext,
  args: { date?: string; from?: string; to?: string; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "roosterBekijkenAan",
    async (child) => {
      const { from, to } = resolveRange(
        args,
        { from: todayAmsterdam(), days: SCHEDULE_DEFAULT_DAYS },
        SCHEDULE_MAX_DAYS,
      );
      return fetchSchedule(ctx.client, child.leerlingId, from, to);
    },
  );
}
