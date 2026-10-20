import { fetchExamContexts, fetchExamOverview } from "../api/results.js";
import { childTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import type { ToolResult } from "./result.js";

export async function examGradesTool(
  ctx: ToolContext,
  args: { examenjaar?: number; leerlingId?: string },
): Promise<ToolResult> {
  return childTool(ctx, args.leerlingId, "seResultaatAan", async (child) => {
    const contexts = await fetchExamContexts(ctx.client, child.leerlingId);
    if (contexts.length === 0) {
      return {
        available: false,
        reason: "No exam dossier (PTA/SE) for this child yet",
      };
    }
    const context = args.examenjaar
      ? contexts.find((item) => item.examenjaar === args.examenjaar)
      : contexts[0];
    if (!context) {
      throw new Error(
        `No exam dossier for ${args.examenjaar}. Known: ${contexts.map((item) => item.examenjaar).join(", ")}`,
      );
    }
    return {
      examendossier: context,
      andereExamenjaren: contexts
        .filter((item) => item !== context)
        .map((item) => item.examenjaar),
      vakken: await fetchExamOverview(ctx.client, child.leerlingId, context),
    };
  });
}
