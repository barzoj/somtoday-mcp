import { fetchAnnouncements, fetchNews, fetchUnreadNews } from "../api/news.js";
import { accountTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { section, type ToolResult } from "./result.js";

export async function newsTool(
  ctx: ToolContext,
  args: { limit?: number },
): Promise<ToolResult> {
  return accountTool(ctx, async () => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 200);
    const [nieuws, ongelezen] = await Promise.all([
      section(() => fetchNews(ctx.client, limit)),
      section(() => fetchUnreadNews(ctx.client)),
    ]);
    return { ongelezen, nieuwsberichten: nieuws };
  });
}

export async function announcementsTool(ctx: ToolContext): Promise<ToolResult> {
  return accountTool(ctx, async () => ({
    mededelingen: await section(() => fetchAnnouncements(ctx.client)),
  }));
}
