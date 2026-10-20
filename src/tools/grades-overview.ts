import {
  fetchGradeOverview,
  fetchPlaatsingen,
  pickPlaatsing,
} from "../api/results.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import type { ToolResult } from "./result.js";

export async function gradesOverviewTool(
  ctx: ToolContext,
  args: { schooljaar?: string; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "cijfersBekijkenAan",
    async (child) => {
      const plaatsingen = await fetchPlaatsingen(ctx.client, child.leerlingId);
      const plaatsing = pickPlaatsing(plaatsingen, args.schooljaar);
      return {
        plaatsing,
        andereSchooljaren: plaatsingen
          .filter((item) => item.uuid !== plaatsing.uuid)
          .map((item) => item.schooljaar),
        ...(await fetchGradeOverview(
          ctx.client,
          child.leerlingId,
          plaatsing.uuid,
        )),
      };
    },
  );
}
