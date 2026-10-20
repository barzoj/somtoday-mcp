import { fetchAssignmentDetail, fetchAssignments } from "../api/assignments.js";
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

export async function assignmentDetailTool(
  ctx: ToolContext,
  args: { toekenningId: string; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(ctx, args.leerlingId, "huiswerkBekijkenAan", async () => {
    const id = Number(args.toekenningId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("toekenningId must be the numeric id from `assignments`");
    }
    return {
      toekenningId: id,
      ...(await fetchAssignmentDetail(ctx.client, id)),
    };
  });
}
