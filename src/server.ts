import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createDefaultSession } from "./auth/default-session.js";
import type { SessionManager } from "./auth/session.js";
import { assignmentDetailTool, assignmentsTool } from "./tools/assignments.js";
import { authStatusTool } from "./tools/auth-status.js";
import { createToolContext } from "./tools/context.js";
import { gradesTool } from "./tools/grades.js";
import { homeworkTool } from "./tools/homework.js";
import { lessonsTool } from "./tools/lessons.js";
import { gradesLatestTool } from "./tools/grades-latest.js";
import { gradesOverviewTool } from "./tools/grades-overview.js";
import { subjectGradesTool } from "./tools/subject-grades.js";
import { examGradesTool } from "./tools/exam-grades.js";
import { absenceTool } from "./tools/absence.js";
import { messagesTool } from "./tools/messages.js";
import { announcementsTool, newsTool } from "./tools/news.js";
import { childrenTool, schoolInfoTool, teachersTool } from "./tools/profile.js";
import { scheduleTool } from "./tools/schedule.js";
import { studyMaterialTool } from "./tools/study-material.js";
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
    "schedule",
    {
      title: "Schedule",
      description:
        "Timetable for a date range, per day: lessons, tests and other appointments with time, lesson hour, subject, room, teachers, type (e.g. ROOSTERTOETS, EXAMEN, OUDERAVOND), lesson notes, changes and cancellations (meldingen/wijziging), attachments, and holidays. Defaults to today plus 6 days; at most 42 days.",
      inputSchema: {
        ...rangeArgs("Defaults to today."),
        leerlingId: leerlingArg,
      },
    },
    async (args) => scheduleTool(ctx, args),
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
    "assignments",
    {
      title: "Assignments (hand-ins)",
      description:
        "All hand-in assignments with their window, status (AANKOMEND, IN_TE_LEVEREN, IN_AFWACHTING, AKKOORD), late flag, description, attachments and links. status=open keeps upcoming and to-do ones. Use toekenningId with assignment_detail.",
      inputSchema: {
        status: z.enum(["open", "all"]).optional().describe("Default all."),
        leerlingId: leerlingArg,
      },
    },
    async (args) => assignmentsTool(ctx, args),
  );

  server.registerTool(
    "assignment_detail",
    {
      title: "Assignment detail",
      description:
        "Submissions (date, status, file or link) and teacher reactions for one assignment.",
      inputSchema: {
        toekenningId: z
          .string()
          .regex(/^\d+$/)
          .describe("Numeric toekenningId from assignments or homework."),
        leerlingId: leerlingArg,
      },
    },
    async (args) => assignmentDetailTool(ctx, args),
  );

  server.registerTool(
    "study_material",
    {
      title: "Study material",
      description:
        "Studiemateriaal per subject: lesson material from the study planner (by date), year attachments by folder (file links), external links, and methods/publisher links (book fund). Without arguments: the subjects that have material, plus personal learning products when the school allows it. vak = name, abbreviation or uuid; all=true fetches every subject.",
      inputSchema: {
        vak: z
          .string()
          .optional()
          .describe("Subject name, abbreviation or uuid."),
        all: z
          .boolean()
          .optional()
          .describe("Fetch material for every subject."),
        leerlingId: leerlingArg,
      },
    },
    async (args) => studyMaterialTool(ctx, args),
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
    "grades_latest",
    {
      title: "Latest grades",
      description:
        "Newest results first, with subject, column, description, grade, weight, test type, period, date, remarks and resit info. limit defaults to 50 (max 1000, paged). dossier=examen gives school-exam (SE) results. Also the next publication moment when the school uses one.",
      inputSchema: {
        limit: z.number().int().min(1).max(1000).optional(),
        dossier: z
          .enum(["voortgang", "examen"])
          .optional()
          .describe("Default voortgang."),
        leerlingId: leerlingArg,
      },
    },
    async (args) => gradesLatestTool(ctx, args),
  );

  server.registerTool(
    "grades_overview",
    {
      title: "Grade overview",
      description:
        "The full grade overview (cijferoverzicht) for a school year: every subject with every result per period, report grades, weights and remarks. Defaults to the current placement; schooljaar like 2025/2026 picks another year.",
      inputSchema: {
        schooljaar: z
          .string()
          .optional()
          .describe('School year name, e.g. "2025/2026".'),
        leerlingId: leerlingArg,
      },
    },
    async (args) => gradesOverviewTool(ctx, args),
  );

  server.registerTool(
    "subject_grades",
    {
      title: "Subject grades",
      description:
        "Everything for one subject: every result column (tests, assignments, period and report averages, SE averages) with weights and remarks, column definitions (also not-yet-graded ones), and the parts of composite tests. Both progress and exam dossier unless dossier is set. Without vak: the list of subjects.",
      inputSchema: {
        vak: z
          .string()
          .optional()
          .describe("Subject name, abbreviation or uuid."),
        dossier: z.enum(["voortgang", "examen"]).optional(),
        leerlingId: leerlingArg,
      },
    },
    async (args) => subjectGradesTool(ctx, args),
  );

  server.registerTool(
    "exam_grades",
    {
      title: "Exam dossier (SE)",
      description:
        "School-exam dossier (PTA/SE) overview: per subject the SE average, every SE result, tests still to come, and test-type averages. Says so when the child has no exam dossier yet.",
      inputSchema: {
        examenjaar: z
          .number()
          .int()
          .optional()
          .describe("Exam year; defaults to the latest."),
        leerlingId: leerlingArg,
      },
    },
    async (args) => examGradesTool(ctx, args),
  );

  server.registerTool(
    "absence",
    {
      title: "Absence and registrations",
      description:
        "Registrations for the school year (or current grading period): unexcused and excused absence, late, removed from class, homework not done, materials missing — counts and every entry with date, lesson and remark — plus active measures (e.g. detention).",
      inputSchema: {
        periode: z
          .enum(["SCHOOLJAAR", "CIJFERPERIODE"])
          .optional()
          .describe("Default SCHOOLJAAR."),
        leerlingId: leerlingArg,
      },
    },
    async (args) => absenceTool(ctx, args),
  );

  server.registerTool(
    "messages",
    {
      title: "Messages",
      description:
        "Somtoday messages (berichten), read-only: newest conversations with subject, sender, date, unread flag and a preview; filter with zoek or ongelezen. Pass conversatieId for the full thread (text, sender, recipients, attachments). Never marks anything as read.",
      inputSchema: {
        conversatieId: z.string().regex(/^\d+$/).optional(),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Default 25."),
        zoek: z
          .string()
          .optional()
          .describe("Search in subject, sender and preview."),
        ongelezen: z
          .boolean()
          .optional()
          .describe("Only unread conversations."),
      },
    },
    async (args) => messagesTool(ctx, args),
  );

  server.registerTool(
    "news",
    {
      title: "School news",
      description:
        "News items from the school (nieuwsberichten), newest first, as text, plus the unread count.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Default 25."),
      },
    },
    async (args) => newsTool(ctx, args),
  );

  server.registerTool(
    "announcements",
    {
      title: "Announcements",
      description:
        "Somtoday-wide announcements (landelijke mededelingen) shown in the portal, with publication window.",
      inputSchema: {},
    },
    async () => announcementsTool(ctx),
  );

  server.registerTool(
    "children",
    {
      title: "Children",
      description:
        "Linked children with profile (name, student number, class), school data (school, location, mentor(s), year, programme), current placement, and which portal sections the school shows.",
      inputSchema: {},
    },
    async () => childrenTool(ctx),
  );

  server.registerTool(
    "school_info",
    {
      title: "School information",
      description:
        "School contact data per child and the school's published information pages. Pass paginaId for one page with its topics and documents.",
      inputSchema: {
        paginaId: z.number().int().optional(),
      },
    },
    async (args) => schoolInfoTool(ctx, args),
  );

  server.registerTool(
    "teachers",
    {
      title: "Teachers",
      description:
        "Staff you can message, with the subjects they teach your child.",
      inputSchema: {},
    },
    async () => teachersTool(ctx),
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
