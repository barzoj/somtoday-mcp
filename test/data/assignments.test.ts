import { describe, expect, it } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetchAssignmentDetail } from "../../src/api/assignments.js";
import {
  SUBMISSIONS_STUDENT_ONLY,
  assignmentDetailTool,
  assignmentsTool,
} from "../../src/tools/assignments.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";
import { LEERLING, handIn } from "../fixtures/studiewijzer.js";

const NOW = new Date("2026-10-20T12:00:00Z");

describe("assignments", () => {
  it("lists hand-ins sorted by deadline with the portal's categories", async () => {
    const groupOnly = handIn(9, "2026-10-01T06:00:00Z", "2026-10-30T21:59:00Z");
    groupOnly.studiewijzerItem.projectgroepen = true;
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [
        /studiewijzeritemdagtoekenningen.*heeftInleverperiode=true/,
        () =>
          listResponse([
            handIn(1, "2026-11-01T06:00:00Z", "2026-11-10T21:59:00Z"),
            handIn(2, "2026-10-01T06:00:00Z", "2026-10-19T21:59:00Z"),
            handIn(
              3,
              "2026-10-01T06:00:00Z",
              "2026-10-25T21:59:00Z",
              "TE_BEOORDELEN",
            ),
            handIn(
              4,
              "2026-09-01T06:00:00Z",
              "2026-09-10T21:59:00Z",
              "AKKOORD",
            ),
            handIn(
              5,
              "2026-10-01T06:00:00Z",
              "2026-10-28T21:59:00Z",
              "HEROPEND",
            ),
            groupOnly,
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await assignmentsTool(ctx, {}, NOW)) as {
      total: number;
      items: Array<Record<string, unknown>>;
    };
    expect(out.total).toBe(5);
    expect(
      out.items.map((item) => [item.toekenningId, item.categorie, item.teLaat]),
    ).toEqual([
      [4, "AKKOORD", undefined],
      [2, "IN_TE_LEVEREN", true],
      [3, "IN_AFWACHTING", undefined],
      [5, "IN_TE_LEVEREN", false],
      [1, "AANKOMEND", undefined],
    ]);
    expect(out.items[0]).toMatchObject({
      inleverStatus: "AKKOORD",
      inlevermoment: { omschrijving: "Inleveren als PDF" },
    });
    expect(calls[1]?.url.searchParams.has("jaarWeek")).toBe(false);

    const open = toolJson(
      await assignmentsTool(ctx, { status: "open" }, NOW),
    ) as {
      items: Array<Record<string, unknown>>;
    };
    expect(open.items.map((item) => item.toekenningId)).toEqual([2, 5, 1]);
  });
});

describe("fetchAssignmentDetail (student sessions only)", () => {
  it("maps submissions and teacher reactions", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [
        /inleverdetails\/77$/,
        () =>
          jsonResponse(200, {
            aantalInleveringenInVerwerking: 0,
            latestTurnitInEulaUrl: "https://eula.example.test",
            inleveringen: [
              {
                links: [{ id: 1, rel: "self" }],
                verzendDatum: "2026-10-18T10:00:00Z",
                wijzigingsDatum: "2026-10-19T10:00:00Z",
                status: "AKKOORD",
                assemblyResults: [
                  {
                    assemblyFileType: "DOCUMENT",
                    fileName: "verslag.pdf",
                    fileUrl: "https://files.example.test/verslag.pdf",
                    fileExtension: "pdf",
                    fileSize: 10,
                  },
                ],
              },
              {
                links: [{ id: 2, rel: "self" }],
                verzendDatum: "2026-10-17T10:00:00Z",
                status: "HEROPEND",
                inhoud: "https://docs.example.test/link",
              },
            ],
            conversatie: {
              boodschappen: [
                {
                  verzendDatum: "2026-10-19T11:00:00Z",
                  onderwerp: "Feedback",
                  inhoud: "<p>Goed gedaan</p>",
                  additionalObjects: {
                    verzenderCorrespondent: { naam: "Docent A" },
                    verzondenDoorGebruiker: false,
                  },
                },
              ],
            },
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = await fetchAssignmentDetail(ctx.client, 77);
    expect(out).toMatchObject({
      aantalInleveringenInVerwerking: 0,
      inleveringen: [
        {
          id: 1,
          status: "AKKOORD",
          naam: "verslag.pdf",
          fileUrl: "https://files.example.test/verslag.pdf",
        },
        { id: 2, status: "HEROPEND", url: "https://docs.example.test/link" },
      ],
      reacties: [
        {
          van: "Docent A",
          doorJou: false,
          onderwerp: "Feedback",
          inhoud: "Goed gedaan",
        },
      ],
    });
    expect(JSON.stringify(out)).not.toContain("eula");
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
  });
});

describe("assignment_detail (parent view)", () => {
  const list = () =>
    listResponse([
      handIn(31, "2026-10-01T06:00:00Z", "2026-10-25T21:59:00Z"),
      handIn(32, "2026-11-01T06:00:00Z", "2026-11-10T21:59:00Z"),
    ]);

  it("returns the dag-toekenning from the hand-in list, never calls inleverdetails", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [/studiewijzeritemdagtoekenningen.*heeftInleverperiode=true/, list],
      [/inleverdetails/, () => jsonResponse(400, { message: "x" })],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await assignmentDetailTool(ctx, { toekenningId: "31" }, NOW);
    expect(result.isError).toBeFalsy();
    const out = toolJson(result) as Record<string, any>;
    expect(out.toekenningId).toBe(31);
    expect(out.opdracht).toMatchObject({
      toekenningId: 31,
      soort: "dag",
      categorie: "IN_TE_LEVEREN",
      onderwerp: "Opdracht 31",
      omschrijving: "Lees paragraaf 3.2",
      inlevermoment: {
        eind: "2026-10-25T21:59:00Z",
        omschrijving: "Inleveren als PDF",
      },
    });
    expect(out.opdracht.bijlagen[0].fileUrl).toBe(
      "https://files.example.test/werkblad.pdf",
    );
    expect(out.inleveringen).toMatchObject({
      available: false,
      reason: SUBMISSIONS_STUDENT_ONLY,
    });
    expect(
      calls.some((call) => call.url.pathname.includes("inleverdetails")),
    ).toBe(false);
    expect(calls.every((call) => call.init?.method === "GET")).toBe(true);
  });

  it("explains an id that is not a hand-in", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
      [/studiewijzeritemdagtoekenningen.*heeftInleverperiode=true/, list],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await assignmentDetailTool(ctx, { toekenningId: "99" }, NOW);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(
      /No hand-in assignment with toekenningId 99/,
    );
  });

  it("rejects a non-numeric id", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(LEERLING)],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await assignmentDetailTool(ctx, { toekenningId: "abc" });
    expect(result.isError).toBe(true);
  });
});
