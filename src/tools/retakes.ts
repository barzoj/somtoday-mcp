import {
  fetchLatestResults,
  hasHerkansing,
  isNietGemaakt,
  type Dossier,
  type ResultView,
} from "../api/results.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import type { ToolResult } from "./result.js";

export const RETAKES_DEFAULT = 200;
export const RETAKES_MAX = 1000;

/**
 * Parent-portal note: herkansing is retake *policy and scored attempts* on
 * geldend results. There is no verified parent-API resource for retake
 * registration (aanmelden) or scheduled make-up moments (inhaalmomenten).
 */
export const RETAKES_LIMITATIONS = {
  aanmelden:
    "No parent-portal endpoint for registering for a retake was found in ouder-portal.openapi.yaml, the leerling web client codegen, or public Somtoday API docs.",
  inhaalmomenten:
    "No parent-portal endpoint or field for make-up dates (inhaalmomenten) was found. Missed tests may appear as bijzonderheid=NietGemaakt on a result, without a scheduled make-up date.",
} as const;

export function pickRetakes(items: ResultView[]) {
  const herkansingen = items.filter(hasHerkansing);
  const nietGemaakt = items
    .filter(isNietGemaakt)
    .filter((item) => !hasHerkansing(item));
  return { herkansingen, nietGemaakt };
}

export async function retakesTool(
  ctx: ToolContext,
  args: { limit?: number; dossier?: Dossier; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "cijfersBekijkenAan",
    async (child) => {
      const limit = Math.min(
        Math.max(args.limit ?? RETAKES_DEFAULT, 1),
        RETAKES_MAX,
      );
      const dossier = args.dossier ?? "voortgang";
      const latest = await fetchLatestResults(
        ctx.client,
        child.leerlingId,
        dossier,
        limit,
      );
      const { herkansingen, nietGemaakt } = pickRetakes(latest.items);
      return {
        dossier,
        scanned: latest.items.length,
        total: latest.total,
        herkansingen,
        nietGemaakt,
        limitations: RETAKES_LIMITATIONS,
      };
    },
  );
}
