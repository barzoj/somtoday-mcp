import { describe, expect, it } from "vitest";
import { gradesOverviewTool } from "../../src/tools/grades-overview.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

const plaatsingen = () =>
  listResponse([
    {
      UUID: "p-old",
      huidig: false,
      leerjaar: 1,
      schooljaar: { naam: "2025/2026" },
      vanafDatum: "2025-08-01",
    },
    {
      UUID: "p-now",
      huidig: true,
      leerjaar: 2,
      opleidingsnaam: "havo",
      stamgroepnaam: "2A",
      schooljaar: { naam: "2026/2027" },
      vanafDatum: "2026-08-01",
      vestiging: { naam: "Fixture" },
    },
  ]);

const overview = () =>
  jsonResponse(200, {
    $type: "resultaten.RLeerlingVoortgangResultaten",
    cijferperioden: [
      { periode: 1, datumVan: "2026-08-20", datumTot: "2026-11-15" },
    ],
    vakResultaten: [
      {
        vakkeuze: {
          vak: { UUID: "wi", naam: "Wiskunde", afkorting: "wi" },
          lichting: { UUID: "l1" },
          relevanteCijferLichting: { UUID: "l2" },
          vrijstelling: false,
        },
        standaardNormering: "Cijfer",
        perioden: [
          {
            periode: 1,
            rapportCijfer: {
              formattedResultaat: "7,0",
              cijfer: 7,
              type: "RapportCijferKolom",
              periode: 1,
            },
            resultaten: [
              {
                formattedResultaat: "6,8",
                weging: 1,
                omschrijving: "SO H1",
                toetssoort: "SO",
                periode: 1,
              },
            ],
          },
        ],
      },
      {
        vakkeuze: { vak: { UUID: "en", naam: "Engels", afkorting: "en" } },
        perioden: [],
      },
    ],
  });

describe("grades_overview", () => {
  it("uses the current placement and maps subjects × periods", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/plaatsingen\?leerling=4242/, plaatsingen],
      [/cijferoverzicht\/4242\?plaatsing=p-now/, overview],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await gradesOverviewTool(ctx, {})) as Record<
      string,
      unknown
    > & {
      vakken: Array<Record<string, unknown>>;
    };
    expect(out.plaatsing).toMatchObject({
      uuid: "p-now",
      schooljaar: "2026/2027",
      leerjaar: 2,
      opleiding: "havo",
    });
    expect(out.andereSchooljaren).toEqual(["2025/2026"]);
    expect(out.perioden).toEqual([
      { periode: 1, van: "2026-08-20", tot: "2026-11-15" },
    ]);
    expect(out.vakken.map((vak) => vak.vak)).toEqual(["Engels", "Wiskunde"]);
    expect(out.vakken[1]).toMatchObject({
      vakUuid: "wi",
      lichtingUuid: "l2",
      normering: "Cijfer",
      perioden: [
        {
          periode: 1,
          rapportCijfer: { resultaat: "7,0", type: "RapportCijferKolom" },
          resultaten: [
            {
              resultaat: "6,8",
              weging: 1,
              omschrijving: "SO H1",
              toetssoort: "SO",
            },
          ],
        },
      ],
    });
    expect(calls).toHaveLength(3);
  });

  it("picks another school year and explains unknown ones", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/plaatsingen/, plaatsingen],
      [/cijferoverzicht\/4242\?plaatsing=p-old/, overview],
    ]);
    const ctx = await toolContext(fetchFn);
    toolJson(await gradesOverviewTool(ctx, { schooljaar: "2025/2026" }));
    expect(calls.at(-1)?.url.searchParams.get("plaatsing")).toBe("p-old");
    const bad = await gradesOverviewTool(ctx, { schooljaar: "1999/2000" });
    expect(bad.content[0]?.text).toMatch(/2026\/2027, 2025\/2026/);
  });
});
