import { describe, expect, it } from "vitest";
import { scheduleTool } from "../../src/tools/schedule.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

const afspraak = (begin: string, extra: Record<string, unknown> = {}) => ({
  $type: "participatie.live.RAfspraakItem",
  links: [{ id: 300, rel: "self" }],
  afspraakItemType: "ROOSTER",
  beginDatumTijd: begin,
  eindDatumTijd: begin.replace("T08", "T09"),
  beginLesuur: 2,
  eindLesuur: 2,
  bijlagen: [],
  docentNamen: ["Docent A"],
  lesgroepen: [],
  locatie: "B1.02",
  omschrijving: "<p>Neem schrift mee</p>",
  onlineDeelname: false,
  statusNotifications: [],
  titel: "wi - Docent A",
  uniqueIdentifier: "u",
  vak: {
    $type: "participatie.live.RAfspraakVak",
    UUID: "v",
    afkorting: "wi",
    id: 1,
    naam: "Wiskunde",
  },
  wijzigingOmschrijving: "",
  ...extra,
});

describe("schedule", () => {
  it("returns lessons per day with changes, type, notes and holidays", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/afspraakitems\/4242\/jaar\/2026\/week\/52/,
        () =>
          jsonResponse(
            206,
            {
              items: [
                afspraak("2026-12-21T08:00:00Z", {
                  statusNotifications: [
                    { status: "2002", message: "Inschrijving in orde." },
                  ],
                }),
                afspraak("2026-12-23T08:00:00Z", {
                  statusNotifications: [
                    { status: "2002", message: "Inschrijving in orde." },
                    { status: "4007", message: "Les vervalt" },
                  ],
                }),
                afspraak("2026-12-22T08:00:00Z", {
                  afspraakItemType: "ROOSTERTOETS",
                  wijzigingOmschrijving: "Lokaal gewijzigd",
                  statusNotifications: [
                    {
                      $type: "x",
                      status: "GEWIJZIGD",
                      message: "Ander lokaal",
                    },
                  ],
                  beginLesuur: 3,
                  eindLesuur: 4,
                }),
              ],
              statusNotifications: [
                { status: "INFO", message: "Rooster bijgewerkt" },
                { status: "2002", message: "Inschrijving in orde." },
                { status: "INFO", message: "Rooster bijgewerkt" },
              ],
            },
            { "content-range": "items 0-2/3" },
          ),
      ],
      [/\/afspraakitems\/4242\/jaar\/2026\/week\/53/, () => listResponse([])],
      [
        /\/vakanties\/verzorger/,
        () =>
          listResponse([
            {
              naam: "Kerstvakantie",
              beginDatum: "2026-12-26",
              eindDatum: "2027-01-10",
            },
            {
              naam: "Herfstvakantie",
              beginDatum: "2026-10-17",
              eindDatum: "2026-10-25",
            },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await scheduleTool(ctx, { from: "2026-12-21", to: "2026-12-28" }),
    ) as {
      meldingen: unknown[];
      vakanties: unknown[];
      days: Array<{
        datum: string;
        vakantie?: string;
        items?: Array<Record<string, unknown>>;
      }>;
    };
    expect(out.meldingen).toEqual([
      { status: "INFO", message: "Rooster bijgewerkt" },
    ]);
    expect(out.vakanties).toEqual([
      { naam: "Kerstvakantie", van: "2026-12-26", tot: "2027-01-10" },
    ]);
    expect(out.days).toHaveLength(8);
    expect(out.days[0]!.items![0]).toMatchObject({
      id: 300,
      lesuur: "2",
      type: "ROOSTER",
      vak: "Wiskunde",
      locatie: "B1.02",
      docenten: ["Docent A"],
      omschrijving: "Neem schrift mee",
    });
    expect(out.days[1]!.items![0]).toMatchObject({
      lesuur: "3-4",
      type: "ROOSTERTOETS",
      wijziging: "Lokaal gewijzigd",
      meldingen: [{ status: "GEWIJZIGD", message: "Ander lokaal" }],
    });
    expect(out.days[0]!.items![0]!.meldingen).toBeUndefined();
    expect(out.days[0]!.items![0]!.uitgevallen).toBeUndefined();
    expect(out.days[2]!.items![0]).toMatchObject({
      uitgevallen: true,
      meldingen: [{ status: "4007", message: "Les vervalt" }],
    });
    expect(out.days[5]).toEqual({
      datum: "2026-12-26",
      vakantie: "Kerstvakantie",
      items: [],
    });
    expect(out.days[3]).toEqual({ datum: "2026-12-24", items: [] });
    expect(
      calls.filter((call) => call.url.pathname.includes("afspraakitems")),
    ).toHaveLength(2);
  });

  it("respects roosterBekijkenAan", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242, { roosterBekijkenAan: false })],
    ]);
    const ctx = await toolContext(fetchFn);
    expect(toolJson(await scheduleTool(ctx, {})).available).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
