import { fetchSchedule } from "../api/schedule.js";
import { resolveRange, todayAmsterdam } from "../dates.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import type { ToolResult } from "./result.js";

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
        { from: todayAmsterdam(), days: 7 },
        42,
      );
      return fetchSchedule(ctx.client, child.leerlingId, from, to);
    },
  );
}
