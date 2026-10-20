import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDefaultSession } from "./auth/default-session.js";
import type { SessionManager } from "./auth/session.js";
import { authStatusTool } from "./tools/auth-status.js";
import { createToolContext } from "./tools/context.js";
import { gradesTool } from "./tools/grades.js";
import { homeworkTool } from "./tools/homework.js";
import { lessonsTool } from "./tools/lessons.js";
import { whoamiTool } from "./tools/whoami.js";
import { packageVersion } from "./packageVersion.js";

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .optional()
  .describe("Amsterdam calendar date. Defaults to tomorrow.");

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const rangeArgs = (defaultText: string) => ({
  date: ymd.optional().describe("One Amsterdam calendar date."),
  from: ymd.optional().describe(`First date of the range. ${defaultText}`),
  to: ymd.optional().describe("Last date of the range (inclusive)."),
});

const leerlingArg = z
  .string()
  .optional()
  .describe(
    "Numeric leerling id. Required when more than one child is linked.",
  );

export function createServer(
  session: SessionManager = createDefaultSession(),
): McpServer {
  const ctx = createToolContext(session);
  const server = new McpServer({
    name: "somtoday",
    version: packageVersion(),
  });

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "School label, numeric leerling ids, and which parent-portal sections are visible. No tokens.",
      inputSchema: {},
    },
    async () => whoamiTool(ctx),
  );

  server.registerTool(
    "lessons",
    {
      title: "Lessons",
      description:
        "Timetable for one Amsterdam date, plus whether that date is a holiday.",
      inputSchema: { date: dateArg, leerlingId: leerlingArg },
    },
    async ({ date, leerlingId }) => lessonsTool(ctx, { date, leerlingId }),
  );

  server.registerTool(
    "homework",
    {
      title: "Homework / study planner",
      description:
        "What to do and learn on which day: every studiewijzer item (lesson, day and week items) for a date range, grouped by day, with description, learning goals, time estimate, test type, teacher note, attachments (file links), external links, hand-in window and status, and the done tick. Also lists hand-in deadlines per day. Defaults to today plus 6 days; at most 42 days.",
      inputSchema: {
        ...rangeArgs("Defaults to today."),
        leerlingId: leerlingArg,
      },
    },
    async (args) => homeworkTool(ctx, args),
  );

  server.registerTool(
    "grades",
    {
      title: "Grades",
      description:
        "Newest progress-dossier results (capped at 30) and subject averages.",
      inputSchema: { leerlingId: leerlingArg },
    },
    async ({ leerlingId }) => gradesTool(ctx, { leerlingId }),
  );

  server.registerTool(
    "auth_status",
    {
      title: "Auth status",
      description:
        "Whether a Somtoday session is stored, where (keychain or file), and the outcome of the last token renewal. Never returns tokens. Set check=true to renew the token and call the API once.",
      inputSchema: {
        check: z
          .boolean()
          .optional()
          .describe("Renew the access token and call GET /account/me once."),
      },
    },
    async ({ check }) => authStatusTool(ctx, { check }),
  );

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
