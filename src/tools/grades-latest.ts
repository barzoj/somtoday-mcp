import {
  fetchLatestResults,
  fetchNextPublication,
  type Dossier,
} from "../api/results.js";
import { simplify } from "../api/simplify.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { section, type ToolResult } from "./result.js";

export const LATEST_DEFAULT = 50;
export const LATEST_MAX = 1000;

export async function gradesLatestTool(
  ctx: ToolContext,
  args: { limit?: number; dossier?: Dossier; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "cijfersBekijkenAan",
    async (child) => {
      const limit = Math.min(
        Math.max(args.limit ?? LATEST_DEFAULT, 1),
        LATEST_MAX,
      );
      const dossier = args.dossier ?? "voortgang";
      const [latest, volgende] = await Promise.all([
        fetchLatestResults(ctx.client, child.leerlingId, dossier, limit),
        section(() => fetchNextPublication(ctx.client, child.leerlingId)),
      ]);
      return {
        dossier,
        total: latest.total,
        shown: latest.items.length,
        items: latest.items,
        volgendePublicatie: simplify(volgende) ?? null,
      };
    },
  );
}
