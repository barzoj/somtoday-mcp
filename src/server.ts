import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDefaultStore } from "./auth/keychain-store.js";
import { SessionManager } from "./auth/session.js";
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

const leerlingArg = z
  .string()
  .optional()
  .describe(
    "Numeric leerling id. Required when more than one child is linked.",
  );

export function createServer(
  session = new SessionManager(createDefaultStore()),
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
      title: "Homework",
      description:
        "Lesson, day, week, and hand-in study-planner items for one Amsterdam date.",
      inputSchema: { date: dateArg, leerlingId: leerlingArg },
    },
    async ({ date, leerlingId }) => homeworkTool(ctx, { date, leerlingId }),
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

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
