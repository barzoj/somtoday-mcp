import { describe, expect, it } from "vitest";
import { examGradesTool } from "../../src/tools/exam-grades.js";
import {
  accountMe,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

describe("exam_grades", () => {
  it("says there is no exam dossier when the context is empty", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/leerling\/context\/4242/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await examGradesTool(ctx, {}));
    expect(out).toMatchObject({ available: false });
    expect(calls).toHaveLength(2);
  });

  it("loads the latest exam year with the portal's params", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/leerling\/context\/4242/,
        () =>
          listResponse([
            {
              examenjaar: 2027,
              onderwijssoort: "HAVO",
              plaatsingUUID: "p1",
              lichtingUUID: "l1",
            },
            {
              examenjaar: 2028,
              onderwijssoort: "HAVO",
              plaatsingUUID: "p2",
              lichtingUUID: "l2",
            },
          ]),
      ],
      [
        /\/geldendexamendossierresultaten\/leerling\/cijferoverzicht\/4242/,
        () =>
          listResponse([
            {
              vakkeuze: {
                vak: { UUID: "wi", naam: "Wiskunde", afkorting: "wi" },
              },
              seResultaat: {
                formattedResultaat: "6,9",
                type: "SEGemiddeldeKolom",
              },
              resultaten: [
                {
                  formattedResultaat: "7,2",
                  omschrijving: "SE1",
                  weging: 10,
                  additionalObjects: { toetssoortafkorting: "ST" },
                },
              ],
              overigeToetskolommen: [{ omschrijving: "SE2", weging: 20 }],
              toetssoortGemiddelden: [],
            },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await examGradesTool(ctx, {})) as Record<
      string,
      unknown
    >;
    expect(out.examendossier).toMatchObject({
      examenjaar: 2028,
      plaatsingUuid: "p2",
    });
    expect(out.andereExamenjaren).toEqual([2027]);
    expect(out.vakken).toEqual([
      {
        vak: "Wiskunde",
        afkorting: "wi",
        vakUuid: "wi",
        seResultaat: { resultaat: "6,9", type: "SEGemiddeldeKolom" },
        resultaten: [
          {
            omschrijving: "SE1",
            resultaat: "7,2",
            weging: 10,
            toetssoort: "ST",
          },
        ],
        nogTeBehalen: [{ omschrijving: "SE2", weging: 20 }],
      },
    ]);
    const params = calls.at(-1)!.url.searchParams;
    expect(params.get("plaatsing")).toBe("p2");
    expect(params.get("lichting")).toBe("l2");
    expect(params.get("additional")).toBe("toetssoortafkorting");
  });

  it("respects seResultaatAan", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242, { seResultaatAan: false })],
    ]);
    const ctx = await toolContext(fetchFn);
    expect(toolJson(await examGradesTool(ctx, {})).available).toBe(false);
  });
});
