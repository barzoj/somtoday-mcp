import {
  fetchConsents,
  fetchParentEvening,
  fetchSigningDocument,
  fetchSigningRequests,
  findParentEveningIds,
} from "../api/misc.js";
import { accountTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { section, type ToolResult } from "./result.js";

export async function signingRequestsTool(
  ctx: ToolContext,
): Promise<ToolResult> {
  return accountTool(ctx, async () => ({
    ondertekenverzoeken: await section(() => fetchSigningRequests(ctx.client)),
  }));
}

export async function signingDocumentTool(
  ctx: ToolContext,
  args: { id: string },
): Promise<ToolResult> {
  return accountTool(ctx, async () => ({
    id: args.id,
    ...(await fetchSigningDocument(ctx.client, args.id)),
  }));
}

export async function consentsTool(ctx: ToolContext): Promise<ToolResult> {
  return accountTool(ctx, async () => ({
    toestemmingen: await section(() => fetchConsents(ctx.client)),
  }));
}

export async function parentEveningTool(
  ctx: ToolContext,
  args: { id?: string },
): Promise<ToolResult> {
  return accountTool(ctx, async () => {
    const ids = args.id ? [args.id] : await findParentEveningIds(ctx.client);
    if (ids.length === 0) {
      return {
        ouderavonden: [],
        hint: "No parent-evening invitation found in your messages. Pass id if you have one.",
      };
    }
    const ouderavonden = await Promise.all(
      ids.slice(0, 10).map(async (id) => ({
        id,
        ...((await section(() =>
          fetchParentEvening(ctx.client, id),
        )) as object),
      })),
    );
    return { ouderavonden };
  });
}
