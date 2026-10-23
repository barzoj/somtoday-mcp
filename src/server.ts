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
import {
  consentsTool,
  parentEveningTool,
  signingDocumentTool,
  signingRequestsTool,
} from "./tools/misc.js";
import { downloadAttachmentTool } from "./tools/download.js";
import { scheduleTool } from "./tools/schedule.js";
import { studyMaterialTool } from "./tools/study-material.js";
import { whoamiTool } from "./tools/whoami.js";
import { packageVersion } from "./packageVersion.js";

const dateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .optional()
  .describe("Amsterdam calendar date. Defaults to tomorrow.");

const ymd = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const rangeArgs = (defaultText: string) => ({
  date: ymd().optional().describe("One Amsterdam calendar date."),
  from: ymd().optional().describe(`First date of the range. ${defaultText}`),
  to: ymd().optional().describe("Last date of the range (inclusive)."),
});

/**
 * Ids arrive as JSON numbers from our own output (toekenningId, leerlingId, ...)
 * or as strings typed by a person; accept both and hand the tool a string.
 */
// A factory, so every field gets its own schema (no shared `$ref` in the JSON schema).
const numericId = () =>
  z
    .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
    .transform(String);

/** Free-text or numeric reference (subject name/abbreviation/uuid, page slug). */
const textOrNumber = () => z.union([z.string(), z.number()]).transform(String);

/** Every tool only reads the parent portal; nothing is changed in Somtoday. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const leerlingArg = () =>
  numericId()
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
      annotations: READ_ONLY,
      title: "Who am I",
      description:
        "Start here: the school label, the numeric leerling ids to pass as leerlingId to other tools, and which parent-portal sections are visible. Use children for full profiles. No tokens.",
      inputSchema: {},
    },
    async () => whoamiTool(ctx),
  );

  server.registerTool(
    "lessons",
    {
      annotations: READ_ONLY,
      title: "Lessons",
      description:
        "Timetable for one Amsterdam date, plus whether that date is a holiday. Each lesson has type (ROOSTERTOETS or EXAMEN marks a test in the timetable) and uitgevallen=true when cancelled. Homework and the test topic per lesson are not here: call homework for the same date.",
      inputSchema: { date: dateArg, leerlingId: leerlingArg() },
    },
    async ({ date, leerlingId }) => lessonsTool(ctx, { date, leerlingId }),
  );

  server.registerTool(
    "schedule",
    {
      annotations: READ_ONLY,
      title: "Schedule",
      description:
        "Timetable for a date range, per day: lessons, tests and other appointments with time, lesson hour, subject, room, teachers, type (e.g. ROOSTERTOETS, EXAMEN, OUDERAVOND), lesson notes, changes and cancellations (wijziging, uitgevallen=true, meldingen with real warnings only; the routine 'Inschrijving in orde.' notice is dropped), attachments, and holidays. Every day has items (empty array on a free day). Defaults to today plus 6 days; at most 42 days.",
      inputSchema: {
        ...rangeArgs("Defaults to today."),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => scheduleTool(ctx, args),
  );

  server.registerTool(
    "homework",
    {
      annotations: READ_ONLY,
      title: "Homework / study planner",
      description:
        "What to do and learn on which day: every studiewijzer item (lesson, day and week items) for a date range, grouped by day, with description, learning goals, time estimate, test type, teacher note, attachments (file links), external links, hand-in window and status, and the done tick. Also lists hand-in deadlines per day. Defaults to today plus 6 days; at most 42 days." +
        " Every item lists bijlagen (fileUrl, readable with download_attachment) and externeMaterialen; empty means the teacher attached nothing (lesmateriaal=true is only a flag, there is no separate material call).",
      inputSchema: {
        ...rangeArgs("Defaults to today."),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => homeworkTool(ctx, args),
  );

  server.registerTool(
    "assignments",
    {
      annotations: READ_ONLY,
      title: "Assignments (hand-ins)",
      description:
        "All hand-in assignments with their window, status (AANKOMEND, IN_TE_LEVEREN, IN_AFWACHTING, AKKOORD), teLaat (always a boolean: true only for an open hand-in past its deadline), description, attachments and links. status=open keeps upcoming and to-do ones, and by default hides past-due items where no digital hand-in is expected (inleveringenVerwacht 0, e.g. on paper; count in verborgenZonderInlevering); includeNoHandIn=true keeps them. Near-duplicates (same subject, topic, window and status, e.g. published to two groups) are merged by default, with the other ids in duplicaatToekenningIds; dedupe=false lists them separately. Use toekenningId with assignment_detail." +
        " Every item lists bijlagen (fileUrl, readable with download_attachment) and externeMaterialen; empty means the teacher attached nothing (lesmateriaal=true is only a flag, there is no separate material call).",
      inputSchema: {
        status: z.enum(["open", "all"]).optional().describe("Default all."),
        includeNoHandIn: z
          .boolean()
          .optional()
          .describe(
            "With status=open: also show past-due items without a digital hand-in (inleveringenVerwacht 0). Default false.",
          ),
        dedupe: z
          .boolean()
          .optional()
          .describe(
            "Merge near-duplicate assignments (same subject, topic, window, status). Default true.",
          ),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => assignmentsTool(ctx, args),
  );

  server.registerTool(
    "assignment_detail",
    {
      annotations: READ_ONLY,
      title: "Assignment detail",
      description:
        "One hand-in assignment as the parent portal shows it: instruction text, learning goals, files (fileUrl) and links, hand-in window, status, late flag and group. Submitted files and teacher reactions are only visible to the student in Somtoday, so they are not returned.",
      inputSchema: {
        toekenningId: numericId().describe(
          "toekenningId from assignments (number or digit string).",
        ),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => assignmentDetailTool(ctx, args),
  );

  server.registerTool(
    "study_material",
    {
      annotations: READ_ONLY,
      title: "Study material",
      description:
        "Studiemateriaal per subject: lesson material from the study planner (by date), year attachments by folder (file links), external links, and methods/publisher links (book fund). Without arguments: the subjects that have material, plus personal learning products when the school allows it. vak = name, abbreviation or uuid; all=true fetches every subject." +
        " Every item lists bijlagen (fileUrl, readable with download_attachment) and externeMaterialen; empty means the teacher attached nothing (lesmateriaal=true is only a flag, there is no separate material call).",
      inputSchema: {
        vak: textOrNumber()
          .optional()
          .describe("Subject name, abbreviation or uuid."),
        all: z
          .boolean()
          .optional()
          .describe("Fetch material for every subject."),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => studyMaterialTool(ctx, args),
  );

  server.registerTool(
    "grades",
    {
      annotations: READ_ONLY,
      title: "Grades",
      description:
        "Quick grade summary: the newest progress-dossier results (capped at 30) plus the average per subject. Use grades_latest for more or exam (SE) results, grades_overview for a whole school year, subject_grades for one subject in depth, and exam_grades for the PTA/SE dossier.",
      inputSchema: { leerlingId: leerlingArg() },
    },
    async ({ leerlingId }) => gradesTool(ctx, { leerlingId }),
  );

  server.registerTool(
    "grades_latest",
    {
      annotations: READ_ONLY,
      title: "Latest grades",
      description:
        'Newest results first, with subject, column, description, grade, weight, test type, period, date, remarks and resit info. limit defaults to 50 (max 1000, paged). dossier=examen gives school-exam (SE) results. Also the next publication moment when the school uses one. Use this for "what grades came in recently"; use grades for a short summary with averages, subject_grades for all columns of one subject.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe(
            "Number of newest results to return. Default 50, max 1000.",
          ),
        dossier: z
          .enum(["voortgang", "examen"])
          .optional()
          .describe("Default voortgang."),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => gradesLatestTool(ctx, args),
  );

  server.registerTool(
    "grades_overview",
    {
      annotations: READ_ONLY,
      title: "Grade overview",
      description:
        "The full grade overview (cijferoverzicht) for a school year: every subject with every result per period, report grades, weights and remarks. Defaults to the current placement; schooljaar like 2025/2026 picks another year. Use this for a whole-year report view or earlier years; use subject_grades for one subject, grades_latest for recent results.",
      inputSchema: {
        schooljaar: z
          .string()
          .optional()
          .describe('School year name, e.g. "2025/2026".'),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => gradesOverviewTool(ctx, args),
  );

  server.registerTool(
    "subject_grades",
    {
      annotations: READ_ONLY,
      title: "Subject grades",
      description:
        "Everything for one subject: every result column (tests, assignments, period and report averages, SE averages) with weights and remarks, column definitions (also not-yet-graded ones), and the parts of composite tests. Both progress and exam dossier unless dossier is set. Without vak: the list of subjects. Use this to drill into one subject; use grades_overview for all subjects at once.",
      inputSchema: {
        vak: textOrNumber()
          .optional()
          .describe("Subject name, abbreviation or uuid."),
        dossier: z
          .enum(["voortgang", "examen"])
          .optional()
          .describe(
            "voortgang = progress dossier, examen = school-exam (SE) dossier. Default both.",
          ),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => subjectGradesTool(ctx, args),
  );

  server.registerTool(
    "exam_grades",
    {
      annotations: READ_ONLY,
      title: "Exam dossier (SE)",
      description:
        "School-exam dossier (PTA/SE) overview: per subject the SE average, every SE result, tests still to come, and test-type averages. Says so when the child has no exam dossier yet. Use this for exam-year progress and upcoming SE tests; use grades_latest with dossier=examen for only the newest SE results.",
      inputSchema: {
        examenjaar: z
          .number()
          .int()
          .optional()
          .describe("Exam year; defaults to the latest."),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => examGradesTool(ctx, args),
  );

  server.registerTool(
    "absence",
    {
      annotations: READ_ONLY,
      title: "Absence and registrations",
      description:
        "Registrations for the school year (or current grading period): unexcused and excused absence, late, removed from class, homework not done, materials missing — counts and every entry with date, lesson and remark — plus active measures (e.g. detention).",
      inputSchema: {
        periode: z
          .enum(["SCHOOLJAAR", "CIJFERPERIODE"])
          .optional()
          .describe("Default SCHOOLJAAR."),
        leerlingId: leerlingArg(),
      },
    },
    async (args) => absenceTool(ctx, args),
  );

  server.registerTool(
    "messages",
    {
      annotations: READ_ONLY,
      title: "Messages",
      description:
        "Somtoday messages (berichten), read-only: newest conversations with subject, sender, date, unread flag and a preview; filter with zoek or ongelezen. Pass conversatieId for the full thread (text, sender, recipients, attachments). Never marks anything as read. Use this for personal messages from teachers and the school; school-wide news is in news, Somtoday-wide notices in announcements.",
      inputSchema: {
        conversatieId: numericId()
          .optional()
          .describe(
            "Conversation id from a previous messages call; returns that full thread.",
          ),
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
      annotations: READ_ONLY,
      title: "School news",
      description:
        "News items the school publishes to all parents (nieuwsberichten), newest first, as text, plus the unread count. Use messages for personal conversations and announcements for Somtoday-wide notices from the platform itself.",
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
      annotations: READ_ONLY,
      title: "Announcements",
      description:
        "Somtoday-wide announcements (landelijke mededelingen) from the platform itself, such as maintenance notices, with their publication window. Not school news (use news) or personal messages (use messages).",
      inputSchema: {},
    },
    async () => announcementsTool(ctx),
  );

  server.registerTool(
    "children",
    {
      annotations: READ_ONLY,
      title: "Children",
      description:
        "Linked children with profile (name, student number, class), school data (school, location, mentor(s), year, programme), current placement, and which portal sections the school shows. Use whoami when you only need leerling ids.",
      inputSchema: {},
    },
    async () => childrenTool(ctx),
  );

  server.registerTool(
    "school_info",
    {
      annotations: READ_ONLY,
      title: "School information",
      description:
        "School contact data per child and the school's published information pages. Pass paginaId for one page with its topics and documents. Use teachers for staff and children for mentors.",
      inputSchema: {
        paginaId: numericId()
          .transform(Number)
          .optional()
          .describe(
            "Information page id from the page list of a previous school_info call.",
          ),
      },
    },
    async (args) => schoolInfoTool(ctx, args),
  );

  server.registerTool(
    "teachers",
    {
      annotations: READ_ONLY,
      title: "Teachers",
      description:
        "Teachers and other staff you can message in Somtoday, with the subjects they teach your child. Use children for the mentor(s) and school_info for general school contact data.",
      inputSchema: {},
    },
    async () => teachersTool(ctx),
  );

  server.registerTool(
    "signing_requests",
    {
      annotations: READ_ONLY,
      title: "Signing requests",
      description:
        "Digital signing requests (ondertekenverzoeken) waiting for you or done. Each item has document {tool:'signing_document', id, available}: pass id to signing_document to read the (signed) PDF. Read-only; nothing is signed.",
      inputSchema: {},
    },
    async () => signingRequestsTool(ctx),
  );

  server.registerTool(
    "signing_document",
    {
      annotations: READ_ONLY,
      title: "Signing document",
      description:
        "Read the document (PDF) of one signing request, as the portal's download button does: pass document.id from signing_requests. Returns extracted text (max 10 MB). The document needs your login, so it is not a fileUrl for download_attachment. Usually available once signed; not for requests still to sign, withdrawn or expired.",
      inputSchema: {
        id: textOrNumber()
          .pipe(z.string().regex(/^[A-Za-z0-9-]+$/))
          .describe("Signing request id (document.id from signing_requests)."),
      },
    },
    async (args) => signingDocumentTool(ctx, args),
  );

  server.registerTool(
    "parent_evening",
    {
      annotations: READ_ONLY,
      title: "Parent evening",
      description:
        "Parent-evening (ouderavond) details: invitation, time slots and chosen teachers. Without id, finds invitations linked in your messages. Read-only; nothing is booked.",
      inputSchema: {
        id: textOrNumber()
          .pipe(z.string().regex(/^[A-Za-z0-9-]+$/))
          .optional()
          .describe(
            "Parent-evening id from a previous call or invitation; omit to find invitations in messages.",
          ),
      },
    },
    async (args) => parentEveningTool(ctx, args),
  );

  server.registerTool(
    "consents",
    {
      annotations: READ_ONLY,
      title: "Consents",
      description:
        "Consents (toestemmingen) as set in the portal: each consent item (e.g. use of photos) with the answer recorded in the portal. Read-only; answers cannot be changed here.",
      inputSchema: {},
    },
    async () => consentsTool(ctx),
  );

  server.registerTool(
    "download_attachment",
    {
      annotations: READ_ONLY,
      title: "Download attachment",
      description:
        "Read an attachment (fileUrl from homework, assignments, study material or messages). Only https Somtoday file hosts; max 10 MB; returns extracted text for PDF/text/HTML/CSV/JSON, metadata otherwise.",
      inputSchema: {
        url: z
          .url()
          .describe(
            "fileUrl of an attachment from homework, assignments, study_material or messages.",
          ),
      },
    },
    async (args) => downloadAttachmentTool(ctx, args),
  );

  server.registerTool(
    "auth_status",
    {
      annotations: READ_ONLY,
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
