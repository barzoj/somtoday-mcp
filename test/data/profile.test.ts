import { describe, expect, it } from "vitest";
import { ApiClient } from "../../src/api/client.js";
import { fetchSchoolPage } from "../../src/api/profile.js";
import { ACCEPT_JSON } from "../../src/constants.js";
import {
  childrenTool,
  schoolInfoTool,
  teachersTool,
} from "../../src/tools/profile.js";
import {
  accountMe,
  accountMeChildren,
  jsonResponse,
  listResponse,
  routedFetch,
  sessionWithStore,
  toolContext,
  toolJson,
} from "../helpers.js";
import { herfstvakantie2026, kerstvakantie2026 } from "../fixtures/holidays.js";

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

describe("school_info built-in pages", () => {
  it("opens every id from the list fixture, including -1/-2 and normal pages", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/leerlingen\/verzorger\/schoolgegevens/, schoolgegevens],
      // Parent aggregation often returns [] live; holidays come per child.
      [/\/vakanties\/verzorger/, () => listResponse([])],
      [
        /\/vakanties\/leerling\/4242/,
        () => listResponse([kerstvakantie2026, herfstvakantie2026]),
      ],
      [
        /\/schoolinformatie\/gepubliceerd\/v2\/paginas\/9$/,
        () =>
          jsonResponse(200, {
            id: 9,
            titel: "Over de school",
            introductie: "<p>Welkom</p>",
            onderwerpen: [],
            documentmappen: [],
          }),
      ],
      [
        /\/schoolinformatie\/gepubliceerd\/v2\/paginas$/,
        () =>
          jsonResponse(200, {
            paginas: [
              { id: -1, titel: "Vakanties", standaardPagina: "VAKANTIES" },
              {
                id: -2,
                titel: "Schoolgegevens",
                standaardPagina: "SCHOOLGEGEVENS",
              },
              {
                id: 9,
                titel: "Over de school",
                introductie: "<b>Welkom</b>",
                wijzigingsdatum: "2026-09-01T00:00:00Z",
              },
            ],
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const list = toolJson(await schoolInfoTool(ctx, {})) as {
      paginas: Array<{ paginaId: number }>;
    };
    expect(list.paginas.map((page) => page.paginaId)).toEqual([-1, -2, 9]);

    for (const { paginaId } of list.paginas) {
      const detail = toolJson(await schoolInfoTool(ctx, { paginaId })) as {
        pagina: Record<string, unknown>;
      };
      expect(detail.pagina).toBeDefined();
      expect(detail.pagina.id).toBe(paginaId);
      if (paginaId === -1) {
        expect(detail.pagina).toMatchObject({
          id: -1,
          standaardPagina: "VAKANTIES",
          vakantiesStatus: "ok",
          vakantiesEndpoint: "/vakanties/leerling/{leerlingId}",
          vakanties: [
            { naam: "Herfstvakantie", van: "2026-10-17", tot: "2026-10-25" },
            { naam: "Kerstvakantie", van: "2026-12-21", tot: "2027-01-03" },
          ],
        });
      } else if (paginaId === -2) {
        expect(detail.pagina.standaardPagina).toBe("SCHOOLGEGEVENS");
        expect(detail.pagina.schoolgegevens).toHaveLength(1);
      } else {
        expect(detail.pagina).toMatchObject({
          id: paginaId,
          titel: "Over de school",
          introductie: "Welkom",
        });
      }
    }

    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/4242"),
      ),
    ).toBe(true);
    expect(
      calls.some((call) => call.url.pathname.endsWith("/vakanties/verzorger")),
    ).toBe(false);
    expect(calls.some((call) => /paginas\/-/.test(call.url.pathname))).toBe(
      false,
    );
  });

  it("requires leerlingId for page -1 when several children are linked", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMeChildren([4242, 5252])],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await schoolInfoTool(ctx, { paginaId: -1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({
      error: "Multiple linked students; pass leerlingId",
      children: [{ leerlingId: 4242 }, { leerlingId: 5252 }],
    });
    expect(
      calls.some((call) => call.url.pathname.includes("/vakanties/")),
    ).toBe(false);
  });

  it("loads holidays for the requested child when several are linked", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMeChildren([4242, 5252])],
      [/\/vakanties\/leerling\/5252/, () => listResponse([kerstvakantie2026])],
      [/\/vakanties\/leerling\/4242/, () => listResponse([herfstvakantie2026])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await schoolInfoTool(ctx, { paginaId: -1, leerlingId: "5252" }),
    ) as { pagina: { vakanties: Array<{ naam?: string }> } };
    expect(out.pagina.vakanties.map((item) => item.naam)).toEqual([
      "Kerstvakantie",
    ]);
    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/5252"),
      ),
    ).toBe(true);
    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/4242"),
      ),
    ).toBe(false);
  });

  it("returns empty vakanties when the leerling holidays endpoint is unavailable", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        () => jsonResponse(403, { message: "forbidden" }),
      ],
      [
        /\/vakanties\/verzorger/,
        () => jsonResponse(403, { message: "forbidden" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: unknown[];
        vakantiesStatus: string;
        vakantiesEndpoint: string;
      };
    };
    expect(out.pagina.vakanties).toEqual([]);
    expect(out.pagina.vakantiesStatus).toBe("unavailable:403");
    expect(out.pagina.vakantiesEndpoint).toBe("/vakanties/verzorger");
    // Plain GETs only — official app skips Range on the first holidays request.
    const holidayCalls = calls.filter((call) =>
      call.url.pathname.includes("/vakanties/"),
    );
    expect(holidayCalls.length).toBeGreaterThan(0);
    for (const call of holidayCalls) {
      expect(call.headers.get("range")).toBeNull();
    }
  });

  it("falls back to json Accept when platinum returns an empty leerling list", async () => {
    let leerlingHits = 0;
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          leerlingHits += 1;
          const accept = new Headers(init?.headers).get("accept") ?? "";
          if (
            accept.includes("application/json") &&
            !accept.includes("platinum")
          ) {
            return listResponse([kerstvakantie2026]);
          }
          // Mimic the live parent bug: empty page when asked the platinum way.
          return listResponse([]);
        },
      ],
      [/\/vakanties\/verzorger/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: Array<{ naam?: string }>;
        vakantiesStatus: string;
        vakantiesEndpoint: string;
      };
    };
    expect(out.pagina.vakanties.map((item) => item.naam)).toEqual([
      "Kerstvakantie",
    ]);
    expect(out.pagina.vakantiesStatus).toBe("ok");
    expect(out.pagina.vakantiesEndpoint).toBe(
      "/vakanties/leerling/{leerlingId}?accept=json",
    );
    expect(leerlingHits).toBe(2);
    expect(
      calls
        .filter((call) => call.url.pathname.includes("/vakanties/"))
        .every((call) => call.headers.get("range") === null),
    ).toBe(true);
  });

  it("falls back to /vakanties/verzorger when leerling lists stay empty", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/vakanties\/leerling\/4242/, () => listResponse([])],
      [/\/vakanties\/verzorger/, () => listResponse([herfstvakantie2026])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: Array<{ naam?: string }>;
        vakantiesStatus: string;
        vakantiesEndpoint: string;
      };
    };
    expect(out.pagina.vakanties.map((item) => item.naam)).toEqual([
      "Herfstvakantie",
    ]);
    expect(out.pagina.vakantiesStatus).toBe("ok");
    expect(out.pagina.vakantiesEndpoint).toBe("/vakanties/verzorger");
  });

  it("reports vakantiesStatus empty when every source returns items:[]", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/vakanties\/leerling\/4242/, () => listResponse([])],
      [/\/vakanties\/verzorger/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: unknown[];
        vakantiesStatus: string;
        vakantiesEndpoint: string;
      };
    };
    expect(out.pagina.vakanties).toEqual([]);
    expect(out.pagina.vakantiesStatus).toBe("empty");
    expect(out.pagina.vakantiesEndpoint).toBe("/vakanties/verzorger");
  });

  it("keeps vakantiesStatus empty when leerling is empty and verzorger is 403", async () => {
    // A later unavailable must not override a successful empty primary response.
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [/\/vakanties\/leerling\/4242/, () => listResponse([])],
      [
        /\/vakanties\/verzorger/,
        () => jsonResponse(403, { message: "forbidden" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: unknown[];
        vakantiesStatus: string;
        vakantiesEndpoint: string;
        vakantiesAttempts: Array<{
          endpoint: string;
          httpStatus: number;
          itemCount: number;
        }>;
      };
    };
    expect(out.pagina.vakanties).toEqual([]);
    expect(out.pagina.vakantiesStatus).toBe("empty");
    expect(out.pagina.vakantiesEndpoint).toBe(
      "/vakanties/leerling/{leerlingId}?accept=json",
    );
    expect(out.pagina.vakantiesAttempts).toEqual([
      {
        endpoint: "/vakanties/leerling/{leerlingId}",
        httpStatus: 206,
        itemCount: 0,
      },
      {
        endpoint: "/vakanties/leerling/{leerlingId}?accept=json",
        httpStatus: 206,
        itemCount: 0,
      },
      { endpoint: "/vakanties/verzorger", httpStatus: 403, itemCount: 0 },
    ]);
  });

  it("uses the child entity id from GET /leerlingen when restricties id yields empty vakanties", async () => {
    // Parent session: restricties.leerlingId can disagree with /leerlingen self-link
    // (elisaado: parents take the id from GET /leerlingen). Try both.
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(1111)],
      [
        /\/leerlingen\/1111$/,
        () =>
          jsonResponse(200, {
            links: [{ id: 4242, rel: "self", type: "leerling.RLeerling" }],
            roepnaam: "Kind",
          }),
      ],
      [
        /\/leerlingen$/,
        () =>
          listResponse([
            {
              links: [{ id: 4242, rel: "self", type: "leerling.RLeerling" }],
            },
          ]),
      ],
      [/\/vakanties\/leerling\/1111/, () => listResponse([])],
      [/\/vakanties\/leerling\/4242/, () => listResponse([kerstvakantie2026])],
      [/\/vakanties\/verzorger/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: Array<{ naam?: string }>;
        vakantiesStatus: string;
        vakantiesEndpoint: string;
        vakantiesAttempts: Array<{
          endpoint: string;
          httpStatus: number;
          itemCount: number;
        }>;
      };
    };
    expect(out.pagina.vakanties.map((item) => item.naam)).toEqual([
      "Kerstvakantie",
    ]);
    expect(out.pagina.vakantiesStatus).toBe("ok");
    expect(out.pagina.vakantiesEndpoint).toBe(
      "/vakanties/leerling/{leerlingId}",
    );
    expect(
      calls.some((call) =>
        call.url.pathname.includes("/vakanties/leerling/4242"),
      ),
    ).toBe(true);
    expect(out.pagina.vakantiesAttempts.some((a) => a.itemCount > 0)).toBe(
      true,
    );
    expect(
      JSON.stringify(out.pagina.vakantiesAttempts).includes("1111") ||
        JSON.stringify(out.pagina.vakantiesAttempts).includes("4242"),
    ).toBe(false);
  });

  it("follows Content-Range after a plain first holidays GET like AbstractState", async () => {
    let holidayHits = 0;
    const { fetchFn, calls } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          holidayHits += 1;
          const range = new Headers(init?.headers).get("range");
          if (!range) {
            // Probe page: total advertised, no items yet (parent quirk).
            return jsonResponse(
              206,
              { items: [] },
              { "content-range": "items 0-0/2" },
            );
          }
          expect(range).toBe("items=1-1");
          return jsonResponse(
            206,
            { items: [kerstvakantie2026, herfstvakantie2026] },
            { "content-range": "items 1-1/2" },
          );
        },
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: Array<{ naam?: string }>;
        vakantiesStatus: string;
        vakantiesAttempts: Array<{ itemCount: number }>;
      };
    };
    expect(out.pagina.vakantiesStatus).toBe("ok");
    expect(out.pagina.vakanties.map((item) => item.naam).toSorted()).toEqual([
      "Herfstvakantie",
      "Kerstvakantie",
    ]);
    expect(holidayHits).toBe(2);
    expect(out.pagina.vakantiesAttempts[0]?.itemCount).toBe(2);
    expect(
      calls.filter((call) => call.url.pathname.includes("/vakanties/")),
    ).toHaveLength(2);
  });

  it("stops Content-Range follow-ups when a later holidays page is empty", async () => {
    let holidayHits = 0;
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          holidayHits += 1;
          const range = new Headers(init?.headers).get("range");
          if (!range) {
            return jsonResponse(
              206,
              { items: [kerstvakantie2026] },
              { "content-range": "items 0-0/5" },
            );
          }
          // Stuck/empty follow-up: must not loop until VAKANTIES_MAX_PAGES.
          return jsonResponse(
            206,
            { items: [] },
            { "content-range": "items 0-0/5" },
          );
        },
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: Array<{ naam?: string }>;
        vakantiesStatus: string;
      };
    };
    expect(out.pagina.vakantiesStatus).toBe("ok");
    expect(out.pagina.vakanties.map((item) => item.naam)).toEqual([
      "Kerstvakantie",
    ]);
    expect(holidayHits).toBe(2);
  });

  it("stops Content-Range follow-ups when the range does not advance", async () => {
    let holidayHits = 0;
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          holidayHits += 1;
          const range = new Headers(init?.headers).get("range");
          if (!range) {
            return jsonResponse(
              206,
              { items: [kerstvakantie2026] },
              { "content-range": "items 0-0/5" },
            );
          }
          // Items returned but Content-Range stuck — must not re-request forever.
          return jsonResponse(
            206,
            { items: [herfstvakantie2026] },
            { "content-range": "items 0-0/5" },
          );
        },
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: { vakanties: Array<{ naam?: string }> };
    };
    expect(out.pagina.vakanties.map((item) => item.naam).toSorted()).toEqual([
      "Herfstvakantie",
      "Kerstvakantie",
    ]);
    expect(holidayHits).toBe(2);
  });

  it("keeps holidays from earlier pages when a Content-Range follow-up is 403", async () => {
    let holidayHits = 0;
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          holidayHits += 1;
          const range = new Headers(init?.headers).get("range");
          if (!range) {
            return jsonResponse(
              206,
              { items: [kerstvakantie2026] },
              { "content-range": "items 0-0/3" },
            );
          }
          return jsonResponse(403, { message: "forbidden" });
        },
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: {
        vakanties: Array<{ naam?: string }>;
        vakantiesStatus: string;
      };
    };
    expect(out.pagina.vakantiesStatus).toBe("ok");
    expect(out.pagina.vakanties.map((item) => item.naam)).toEqual([
      "Kerstvakantie",
    ]);
    expect(holidayHits).toBe(2);
  });

  it("reports unavailable when the first follow-up page is 403 and the probe was empty", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          const range = new Headers(init?.headers).get("range");
          if (!range) {
            return jsonResponse(
              206,
              { items: [] },
              { "content-range": "items 0-0/2" },
            );
          }
          return jsonResponse(403, { message: "forbidden" });
        },
      ],
      [
        /\/vakanties\/verzorger/,
        () => jsonResponse(403, { message: "forbidden" }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: { vakantiesStatus: string; vakanties: unknown[] };
    };
    expect(out.pagina.vakanties).toEqual([]);
    expect(out.pagina.vakantiesStatus).toBe("unavailable:403");
  });

  it("surfaces a non-403 follow-up failure from holidays paging", async () => {
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          const range = new Headers(init?.headers).get("range");
          if (!range) {
            return jsonResponse(
              206,
              { items: [] },
              { "content-range": "items 0-0/2" },
            );
          }
          return jsonResponse(500, { message: "boom" });
        },
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await schoolInfoTool(ctx, { paginaId: -1 });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/API HTTP 500/);
  });

  it("follows Content-Range when total is unknown (*)", async () => {
    let holidayHits = 0;
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          holidayHits += 1;
          const range = new Headers(init?.headers).get("range");
          if (!range) {
            return jsonResponse(
              206,
              { items: [kerstvakantie2026] },
              { "content-range": "items 0-0/*" },
            );
          }
          expect(range).toBe("items=1-100");
          // No Content-Range on the follow-up → paging stops.
          return jsonResponse(206, { items: [herfstvakantie2026] });
        },
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: { vakanties: Array<{ naam?: string }> };
    };
    expect(out.pagina.vakanties.map((item) => item.naam).toSorted()).toEqual([
      "Herfstvakantie",
      "Kerstvakantie",
    ]);
    expect(holidayHits).toBe(2);
  });

  it("keeps empty status when a later Accept:json attempt is 403", async () => {
    // Platinum empty (success) then json 403: must not flip to unavailable.
    let hit = 0;
    const { fetchFn } = routedFetch([
      [/\/account\/me/, () => accountMe(4242)],
      [
        /\/vakanties\/leerling\/4242/,
        (_url, init) => {
          hit += 1;
          const accept = new Headers(init?.headers).get("accept") ?? "";
          if (accept.includes("application/json")) {
            return jsonResponse(403, { message: "forbidden" });
          }
          return listResponse([]);
        },
      ],
      [/\/vakanties\/verzorger/, () => listResponse([])],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await schoolInfoTool(ctx, { paginaId: -1 })) as {
      pagina: { vakantiesStatus: string; vakantiesEndpoint: string };
    };
    expect(out.pagina.vakantiesStatus).toBe("empty");
    expect(out.pagina.vakantiesEndpoint).toBe("/vakanties/verzorger");
    expect(hit).toBeGreaterThanOrEqual(2);
  });

  it("rejects holidays page -1 without a leerlingId at the API layer", async () => {
    const { fetchFn } = routedFetch([]);
    const session = await sessionWithStore(fetchFn);
    session.seedAccessToken(
      "access-fixture-not-jwt-plain",
      Date.now() + 60_000,
    );
    const client = new ApiClient(session, fetchFn);
    await expect(fetchSchoolPage(client, -1)).rejects.toThrow(
      /leerlingId is required for the holidays page/,
    );
  });

  it("rejects unknown negative paginaIds", async () => {
    const { fetchFn } = routedFetch([]);
    const session = await sessionWithStore(fetchFn);
    session.seedAccessToken(
      "access-fixture-not-jwt-plain",
      Date.now() + 60_000,
    );
    const client = new ApiClient(session, fetchFn);
    await expect(fetchSchoolPage(client, -99)).rejects.toThrow(
      /Unknown school information page -99/,
    );
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

describe("empty answers", () => {
  it("treats 204 No Content as an empty teacher list", async () => {
    const { fetchFn } = routedFetch([
      [/\/medewerkers\/ontvangers/, () => new Response(null, { status: 204 })],
    ]);
    const ctx = await toolContext(fetchFn);
    const result = await teachersTool(ctx);
    expect(result.isError).toBeFalsy();
    expect(toolJson(result).docenten).toEqual([]);
  });

  it("treats a 200 with an empty body as empty", async () => {
    const { fetchFn } = routedFetch([
      [/\/medewerkers\/ontvangers/, () => new Response("", { status: 200 })],
    ]);
    const ctx = await toolContext(fetchFn);
    expect(toolJson(await teachersTool(ctx)).docenten).toEqual([]);
  });
});
