import {
  dedupeAssignments,
  fetchAssignments,
  findAssignment,
  isPastWithoutHandIn,
} from "../api/assignments.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import type { ToolResult } from "./result.js";

const OPEN = new Set(["AANKOMEND", "IN_TE_LEVEREN"]);

export async function assignmentsTool(
  ctx: ToolContext,
  args: {
    status?: "open" | "all";
    includeNoHandIn?: boolean;
    dedupe?: boolean;
    leerlingId?: string;
  },
  now = new Date(),
): Promise<ToolResult> {
  return childTool(
    ctx,
    args.leerlingId,
    "huiswerkBekijkenAan",
    async (child) => {
      const fetched = await fetchAssignments(ctx.client, child.leerlingId, now);
      const all = args.dedupe === false ? fetched : dedupeAssignments(fetched);
      if (args.status !== "open") {
        return { total: all.length, shown: all.length, items: all };
      }
      const open = all.filter(
        (item) => item.categorie && OPEN.has(item.categorie),
      );
      const items = args.includeNoHandIn
        ? open
        : open.filter((item) => !isPastWithoutHandIn(item));
      const hidden = open.length - items.length;
      return {
        total: all.length,
        shown: items.length,
        ...(hidden > 0 ? { verborgenZonderInlevering: hidden } : {}),
        items,
      };
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
      const id = String(args.toekenningId).trim();
      if (!/^\d+$/.test(id)) {
        throw new Error(
          "toekenningId must be the numeric id from `assignments`",
        );
      }
      const { item: opdracht, total } = await findAssignment(
        ctx.client,
        child.leerlingId,
        id,
        now,
      );
      if (!opdracht) {
        throw new Error(
          `No hand-in assignment with toekenningId ${id} among the ${total} from \`assignments\`. Homework items (lesson/day/week toekenningen) are not hand-ins and already contain all their details.`,
        );
      }
      return {
        toekenningId: opdracht.toekenningId,
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
