import { describe, expect, it } from "vitest";
import { subjectGradesTool } from "../../src/tools/subject-grades.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

const vakkeuzes = () =>
  listResponse([
    {
      vak: { UUID: "wi-uuid", naam: "Wiskunde", afkorting: "wi" },
      lichting: { UUID: "l1" },
      relevanteCijferLichting: { UUID: "l2" },
    },
    {
      vak: { UUID: "ne-uuid", naam: "Nederlands", afkorting: "ne" },
      lichting: { UUID: "l1" },
    },
  ]);

describe("subject_grades", () => {
  it("lists subjects without vak", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakkeuzes\?leerling=4242&actiefOpPeildatum=\d{4}-\d{2}-\d{2}/,
        vakkeuzes,
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await subjectGradesTool(ctx, {})) as {
      vakken: unknown[];
    };
    expect(out.vakken).toEqual([
      {
        vak: "Nederlands",
        afkorting: "ne",
        vakUuid: "ne-uuid",
        lichtingUuid: "l1",
      },
      {
        vak: "Wiskunde",
        afkorting: "wi",
        vakUuid: "wi-uuid",
        lichtingUuid: "l2",
      },
    ]);
    expect(calls).toHaveLength(2);
  });

  it("returns results, columns and composite parts for both dossiers", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/vakkeuzes/, vakkeuzes],
      [
        /\/geldendvoortgangsdossierresultaten\/vakresultaten\/4242\/vak\/wi-uuid\/lichting\/l2/,
        () =>
          listResponse([
            {
              formattedResultaat: "7,1",
              type: "PeriodeGemiddeldeKolom",
              periode: 1,
              additionalObjects: { periodeAfkorting: "P1", leerjaar: 2 },
            },
            {
              formattedResultaat: "6,5",
              type: "SamengesteldeToetsKolom",
              omschrijving: "Praktische opdracht",
              weging: 3,
              additionalObjects: { resultaatkolom: "880" },
            },
          ]),
      ],
      [
        /\/geldendvoortgangsdossierresultaten\/resultaatkolommen\/4242\/vak\/wi-uuid/,
        () =>
          listResponse([
            {
              $type: "x.RToetskolom",
              links: [{ id: 5, rel: "self" }],
              omschrijving: "SO H4",
              weging: 1,
            },
          ]),
      ],
      [
        /\/geldendvoortgangsdossierresultaten\/leerling\/4242\/deeltoetsen\/880/,
        () =>
          listResponse([
            {
              formattedResultaat: "6,0",
              omschrijving: "Deel 1",
              type: "DeeltoetsKolom",
            },
          ]),
      ],
      [
        /\/geldendexamendossierresultaten\/vakresultaten/,
        () => jsonResponse(403, { m: "geen SE" }),
      ],
      [
        /\/geldendexamendossierresultaten\/resultaatkolommen/,
        () => jsonResponse(403, { m: "geen SE" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await subjectGradesTool(ctx, { vak: "wi" })) as Record<
      string,
      Record<string, unknown>
    >;
    expect(out.vak).toMatchObject({ vakUuid: "wi-uuid", lichtingUuid: "l2" });
    expect(out.voortgang!.resultaten).toEqual([
      {
        resultaat: "7,1",
        type: "PeriodeGemiddeldeKolom",
        periode: 1,
        periodeAfkorting: "P1",
        leerjaar: 2,
      },
      {
        kolom: "880",
        omschrijving: "Praktische opdracht",
        resultaat: "6,5",
        weging: 3,
        type: "SamengesteldeToetsKolom",
      },
    ]);
    expect(out.voortgang!.kolommen).toEqual([
      { id: 5, omschrijving: "SO H4", weging: 1 },
    ]);
    expect(out.voortgang!.samengesteldeToetsen).toEqual([
      {
        kolom: "880",
        omschrijving: "Praktische opdracht",
        deeltoetsen: [
          { omschrijving: "Deel 1", resultaat: "6,0", type: "DeeltoetsKolom" },
        ],
      },
    ]);
    expect(out.examen!.resultaten).toMatchObject({
      available: false,
      status: 403,
    });
    const subjectCall = calls.find((call) =>
      call.url.pathname.includes("voortgangsdossierresultaten/vakresultaten"),
    )!;
    expect(subjectCall.url.searchParams.getAll("type")).toHaveLength(10);
    expect(subjectCall.url.searchParams.getAll("additional")).toContain(
      "periodeAfkorting",
    );
    const examCall = calls.find((call) =>
      call.url.pathname.includes("examendossierresultaten/vakresultaten"),
    )!;
    expect(examCall.url.searchParams.getAll("additional")).not.toContain(
      "periodeAfkorting",
    );
  });
});
