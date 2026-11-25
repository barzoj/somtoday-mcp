import { fetchHomeworkRange } from "../api/homework.js";
import { resolveRange, todayAmsterdam } from "../dates.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import type { ToolResult } from "./result.js";

export const HOMEWORK_DEFAULT_DAYS = 7;
/**
 * Somtoday has no range limit here: the planner is read per ISO week, in
 * batches. 350 days (50 weeks) covers a school year and never touches the same
 * week number in two years (the week-item call has no year).
 */
export const HOMEWORK_MAX_DAYS = 350;

export async function homeworkTool(
  ctx: ToolContext,
  args: { date?: string; from?: string; to?: string; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "huiswerkBekijkenAan",
    async (child) => {
      const { from, to } = resolveRange(
        args,
        { from: todayAmsterdam(), days: HOMEWORK_DEFAULT_DAYS },
        HOMEWORK_MAX_DAYS,
      );
      return fetchHomeworkRange(ctx.client, child.leerlingId, from, to);
    },
  );
}
