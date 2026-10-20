import { fetchAssignments } from "../api/assignments.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import type { ToolResult } from "./result.js";

const OPEN = new Set(["AANKOMEND", "IN_TE_LEVEREN"]);

export async function assignmentsTool(
  ctx: ToolContext,
  args: { status?: "open" | "all"; leerlingId?: string },
  now = new Date(),
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "huiswerkBekijkenAan",
    async (child) => {
      const all = await fetchAssignments(ctx.client, child.leerlingId, now);
      const items =
        args.status === "open"
          ? all.filter((item) => item.categorie && OPEN.has(item.categorie))
          : all;
      return { total: all.length, shown: items.length, items };
    },
  );
}

/**
 * What the parent portal shows when an assignment is opened: the item from the
 * hand-in list (`studiewijzeritemdagtoekenningen`) with instruction, files,
 * links, window and status. The portal only loads
 * `studiewijzeritemdagtoekenningen/inleverdetails/{id}` (submissions and
 * teacher reactions) in a student session; for a parent session the API
 * answers 400, so it is not called here.
 */
export async function assignmentDetailTool(
  ctx: ToolContext,
  args: { toekenningId: string; leerlingId?: string },
  now = new Date(),
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "huiswerkBekijkenAan",
    async (child) => {
      const id = Number(args.toekenningId);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(
          "toekenningId must be the numeric id from `assignments`",
        );
      }
      const all = await fetchAssignments(ctx.client, child.leerlingId, now);
      const opdracht = all.find((item) => item.toekenningId === id);
      if (!opdracht) {
        throw new Error(
          `No hand-in assignment with toekenningId ${id}. Use a toekenningId from \`assignments\`; homework items that are not hand-ins already contain all their details.`,
        );
      }
      return {
        toekenningId: id,
        opdracht,
        inleveringen: {
          available: false,
          reason: SUBMISSIONS_STUDENT_ONLY,
        },
      };
    },
  );
}

export const SUBMISSIONS_STUDENT_ONLY =
  "Somtoday shows the submitted files and teacher reactions only in the student's own session; a parent sees the instruction, files, links, hand-in window and status (in opdracht).";
