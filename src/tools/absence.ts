import { fetchActiveMeasures, fetchRegistrations } from "../api/absence.js";
import { hasRight } from "../api/account.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { section, type ToolResult } from "./result.js";

export async function absenceTool(
  ctx: ToolContext,
  args: { periode?: "SCHOOLJAAR" | "CIJFERPERIODE"; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "absentiesBekijkenAan",
    async (child) => {
      const [overzicht, maatregelen] = await Promise.all([
        fetchRegistrations(
          ctx.client,
          child.leerlingId,
          args.periode ?? "SCHOOLJAAR",
        ),
        hasRight(child, "absentieMaatregelBekijkenAan")
          ? section(() => fetchActiveMeasures(ctx.client, child.leerlingId))
          : Promise.resolve({
              available: false,
              reason: "absentieMaatregelBekijkenAan is false",
            }),
      ]);
      return { ...overzicht, actieveMaatregelen: maatregelen };
    },
  );
}
