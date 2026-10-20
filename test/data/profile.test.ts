import { describe, expect, it } from "vitest";
import { ACCEPT_JSON } from "../../src/constants.js";
import {
  childrenTool,
  schoolInfoTool,
  teachersTool,
} from "../../src/tools/profile.js";
import {
  accountMe,
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

const schoolgegevens = () =>
  jsonResponse(200, [
    {
      leerlingId: 4242,
      instellingsnaam: "Fixture College",
      huidigeVestiging: { naam: "Hoofdlocatie", afkorting: "HL" },
      straat: "Schoolstraat 1",
      postcode: "1234 AB",
      plaats: "TESTSTAD",
      telefoonnummer: "000-0000000",
      email: "info@school.example.test",
      leerjaar: 2,
      opleidingNaam: "havo",
      stamgroepnaam: "2A",
      mentoren: ["Mentor B"],
    },
  ]);

describe("children", () => {
  it("combines account, profile, school data and placement", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/leerlingen\/verzorger\/schoolgegevens/, schoolgegevens],
      [
        /\/leerlingen\/4242\?additional=stamgroep/,
        () =>
          jsonResponse(200, {
            roepnaam: "Kind",
            achternaam: "Fixture",
            leerlingnummer: 1,
            additionalObjects: { stamgroep: "2A" },
          }),
      ],
      [
        /\/plaatsingen\?leerling=4242/,
        () =>
          listResponse([
            {
              UUID: "p",
              huidig: true,
              leerjaar: 2,
              schooljaar: { naam: "2026/2027" },
            },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await childrenTool(ctx)) as {
      school: string;
      kinderen: Array<Record<string, unknown>>;
    };
    expect(out.school).toBe("Fixture College");
    expect(out.kinderen[0]).toMatchObject({
      leerlingId: 4242,
      profiel: { roepnaam: "Kind", stamgroep: "2A" },
      school: {
        school: "Fixture College",
        vestiging: "Hoofdlocatie",
        adres: "Schoolstraat 1, 1234 AB TESTSTAD",
        mentoren: ["Mentor B"],
      },
      plaatsing: { uuid: "p", schooljaar: "2026/2027" },
      zichtbareOnderdelen: { huiswerkBekijkenAan: true },
    });
  });
});

describe("school_info", () => {
  it("lists pages (plain JSON) and opens one", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/leerlingen\/verzorger\/schoolgegevens/, schoolgegevens],
      [
        /\/schoolinformatie\/gepubliceerd\/v2\/paginas\/9$/,
        () =>
          jsonResponse(200, {
            id: 9,
            titel: "Vakanties",
            introductie: "<p>Data</p>",
            onderwerpen: [{ titel: "Herfst", inhoud: "<p>17-25 okt</p>" }],
            documentmappen: [],
          }),
      ],
      [
        /\/schoolinformatie\/gepubliceerd\/v2\/paginas$/,
        () =>
          jsonResponse(200, {
            paginas: [
              {
                id: 9,
                titel: "Vakanties",
                introductie: "<b>Data</b>",
                wijzigingsdatum: "2026-09-01T00:00:00Z",
              },
            ],
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const list = toolJson(await schoolInfoTool(ctx, {}));
    expect(list.paginas).toEqual([
      {
        paginaId: 9,
        titel: "Vakanties",
        introductie: "Data",
        gewijzigd: "2026-09-01T00:00:00Z",
      },
    ]);
    const page = toolJson(await schoolInfoTool(ctx, { paginaId: 9 }));
    expect(page.pagina).toEqual({
      id: 9,
      titel: "Vakanties",
      introductie: "Data",
      onderwerpen: [{ titel: "Herfst", inhoud: "17-25 okt" }],
    });
    for (const call of calls.filter((c) =>
      c.url.pathname.includes("schoolinformatie"),
    )) {
      expect(call.headers.get("accept")).toBe(ACCEPT_JSON);
    }
  });
});

describe("teachers", () => {
  it("lists staff with subjects", async () => {
    const { fetchFn } = routedFetch([
      [
        /\/medewerkers\/ontvangers\?additional=vakkenDocentVoorLeerling/,
        () =>
          listResponse([
            {
              $type: "x",
              links: [{ id: 8, rel: "self" }],
              achternaam: "Docent",
              voorletters: "A.",
              additionalObjects: {
                vakkenDocentVoorLeerling: { items: [{ naam: "Wiskunde" }] },
              },
            },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await teachersTool(ctx));
    expect(out.docenten).toEqual([
      { id: 8, achternaam: "Docent", voorletters: "A.", vakken: ["Wiskunde"] },
    ]);
  });
});
