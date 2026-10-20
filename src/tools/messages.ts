import { hasRight, loadChildren } from "../api/account.js";
import {
  conversationId,
  fetchConversations,
  fetchExtraRecipients,
  fetchUnreadCount,
  mapMessage,
  summarizeConversation,
} from "../api/messages.js";
import { accountTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { section, type ToolResult } from "./result.js";

export const MESSAGES_DEFAULT = 25;
export const MESSAGES_MAX = 500;

/**
 * Read-only: listing or reading conversations never marks anything as read
 * (that is a separate POST in the portal, which this server never sends).
 */
export async function messagesTool(
  ctx: ToolContext,
  args: {
    conversatieId?: string;
    limit?: number;
    zoek?: string;
    ongelezen?: boolean;
  },
): Promise<ToolResult> {
  return accountTool(ctx, async () => {
    const children = await loadChildren(ctx.client);
    if (
      children.length > 0 &&
      children.every((child) => !hasRight(child, "berichtenBekijkenAan"))
    ) {
      return {
        available: false,
        reason:
          "berichtenBekijkenAan is false: the school does not show messages",
      };
    }
    if (args.conversatieId) {
      const id = Number(args.conversatieId);
      const { items } = await fetchConversations(ctx.client, { alle: true });
      const conversatie = items.find((item) => conversationId(item) === id);
      if (!conversatie) {
        throw new Error(`No conversation with id ${args.conversatieId}`);
      }
      const berichten = (conversatie.boodschappen ?? []).map(mapMessage);
      for (const bericht of berichten) {
        if (bericht.aantalExtraOntvangers && bericht.id) {
          const extra = await section(() =>
            fetchExtraRecipients(ctx.client, bericht.id!),
          );
          if (Array.isArray(extra)) {
            bericht.aan = [...(bericht.aan ?? []), ...extra];
            delete bericht.aantalExtraOntvangers;
          }
        }
      }
      return {
        ...summarizeConversation(conversatie),
        // Oldest first reads like a thread.
        berichten: berichten.reverse(),
      };
    }
    const limit = Math.min(
      Math.max(args.limit ?? MESSAGES_DEFAULT, 1),
      MESSAGES_MAX,
    );
    const filtering = Boolean(args.zoek || args.ongelezen);
    const [list, ongelezen] = await Promise.all([
      fetchConversations(ctx.client, {
        alle: true,
        maxItems: filtering ? MESSAGES_MAX : limit,
      }),
      section(() => fetchUnreadCount(ctx.client)),
    ]);
    const needle = args.zoek?.toLowerCase();
    const items = list.items
      .map(summarizeConversation)
      .filter((item) => !args.ongelezen || item.ongelezen)
      .filter(
        (item) =>
          !needle ||
          [item.onderwerp, item.van, item.voorbeeld].some((text) =>
            text?.toLowerCase().includes(needle),
          ),
      )
      .slice(0, limit);
    return {
      ongelezenConversaties: ongelezen,
      total: list.total,
      shown: items.length,
      conversaties: items,
    };
  });
}
