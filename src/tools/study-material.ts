import {
  fetchPersonalProducts,
  fetchSubjectMaterial,
  fetchSubjectsWithMaterial,
  findSubject,
  mapLimited,
} from "../api/study-material.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { section, type ToolResult } from "./result.js";

export async function studyMaterialTool(
  ctx: ToolContext,
  args: { vak?: string; all?: boolean; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(ctx, args.leerlingId, undefined, async (child) => {
    const subjects = await fetchSubjectsWithMaterial(
      ctx.client,
      child.leerlingId,
    );
    if (args.vak) {
      const vak = findSubject(subjects, args.vak);
      return {
        vakken: [await fetchSubjectMaterial(ctx.client, child.leerlingId, vak)],
      };
    }
    const persoonlijk = await section(() =>
      fetchPersonalProducts(ctx.client, child.leerlingId),
    );
    if (!args.all) {
      return {
        hint: "Pass vak (name, abbreviation or uuid) for one subject, or all=true for every subject.",
        vakkenMetStudiemateriaal: subjects,
        persoonlijkeLeermiddelen: persoonlijk,
      };
    }
    const vakken = await mapLimited(subjects, 4, (vak) =>
      section(() =>
        fetchSubjectMaterial(ctx.client, child.leerlingId, vak),
      ).then((result) => ("available" in result ? { vak, ...result } : result)),
    );
    return { vakken, persoonlijkeLeermiddelen: persoonlijk };
  });
}
