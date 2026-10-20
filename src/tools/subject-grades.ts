import {
  fetchDeeltoetsen,
  fetchSubjectColumns,
  fetchSubjectResults,
  fetchVakkeuzes,
  findVakkeuze,
  type Dossier,
} from "../api/results.js";
import { mapLimited } from "../api/study-material.js";
import { simplify } from "../api/simplify.js";
import { todayAmsterdam } from "../dates.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { section, type ToolResult } from "./result.js";

export async function subjectGradesTool(
  ctx: ToolContext,
  args: { vak?: string; dossier?: Dossier; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "cijfersBekijkenAan",
    async (child) => {
      const vakken = await fetchVakkeuzes(
        ctx.client,
        child.leerlingId,
        todayAmsterdam(),
      );
      if (!args.vak) {
        return {
          hint: "Pass vak (name, abbreviation or uuid) for every result and column of one subject.",
          vakken,
        };
      }
      const vak = findVakkeuze(vakken, args.vak);
      const dossiers: Dossier[] = args.dossier
        ? [args.dossier]
        : ["voortgang", "examen"];
      const out: Record<string, unknown> = { vak };
      for (const dossier of dossiers) {
        const resultaten = await section(() =>
          fetchSubjectResults(ctx.client, child.leerlingId, vak, dossier),
        );
        const kolommen = await section(() =>
          fetchSubjectColumns(ctx.client, child.leerlingId, vak, dossier),
        );
        let samengesteld: unknown;
        if (Array.isArray(resultaten)) {
          const composites = resultaten.filter(
            (result) =>
              result.type === "SamengesteldeToetsKolom" && result.kolom,
          );
          samengesteld = await mapLimited(composites, 3, async (result) => ({
            kolom: result.kolom,
            omschrijving: result.omschrijving,
            deeltoetsen: await section(() =>
              fetchDeeltoetsen(
                ctx.client,
                child.leerlingId,
                result.kolom!,
                dossier,
              ),
            ),
          }));
        }
        out[dossier] = {
          resultaten,
          kolommen: Array.isArray(kolommen)
            ? (simplify(kolommen) ?? [])
            : kolommen,
          samengesteldeToetsen: samengesteld,
        };
      }
      return out;
    },
  );
}
