import { describe, expect, it } from "vitest";
import { ACCEPT, ACCEPT_JSON } from "../../src/constants.js";
import { announcementsTool, newsTool } from "../../src/tools/news.js";
import {
  jsonResponse,
  listResponse,
  routedFetch,
  toolContext,
  toolJson,
} from "../helpers.js";

describe("news", () => {
  it("pages with amount/start, sends plain JSON Accept and strips HTML", async () => {
    const page = (start: number, count: number) =>
      Array.from({ length: count }, (_, n) => ({
        $type: "x",
        id: start + n,
        titel: `Nieuws ${start + n}`,
        inhoud: "<p>Open <b>dag</b></p>",
        links: [{ id: 1, rel: "self" }],
      }));
    const { fetchFn, calls } = routedFetch([
      [/\/ontvangen\/aantalongelezen/, () => jsonResponse(200, [3])],
      [
        /\/communicatie\/nieuwsberichten\/ontvangen\?/,
        (url) => {
          const start = Number(url.searchParams.get("start"));
          return jsonResponse(200, {
            nieuwsberichten: page(start, start === 0 ? 25 : 5),
          });
        },
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await newsTool(ctx, { limit: 40 })) as {
      ongelezen: number;
      nieuwsberichten: Array<Record<string, unknown>>;
    };
    expect(out.ongelezen).toBe(3);
    expect(out.nieuwsberichten).toHaveLength(30);
    expect(out.nieuwsberichten[0]).toEqual({
      id: 0,
      titel: "Nieuws 0",
      inhoud: "Open dag",
    });
    const newsCalls = calls.filter((call) =>
      call.url.pathname.endsWith("/ontvangen"),
    );
    expect(newsCalls.map((call) => call.url.searchParams.get("start"))).toEqual(
      ["0", "25"],
    );
    for (const call of calls)
      expect(call.headers.get("accept")).toBe(ACCEPT_JSON);
  });
});

describe("announcements", () => {
  it("maps landelijke mededelingen", async () => {
    const { fetchFn, calls } = routedFetch([
      [
        /\/mededelingen/,
        () =>
          listResponse([
            {
              id: 5,
              onderwerp: "Onderhoud",
              inhoud: "<p>Zondag offline</p>",
              startPublicatie: "2026-10-20T00:00:00Z",
              eindPublicatie: "2026-10-26T00:00:00Z",
              notificatieNiveau: "WARNING",
            },
          ]),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(await announcementsTool(ctx));
    expect(out.mededelingen).toEqual([
      {
        id: 5,
        onderwerp: "Onderhoud",
        inhoud: "Zondag offline",
        van: "2026-10-20T00:00:00Z",
        tot: "2026-10-26T00:00:00Z",
        niveau: "WARNING",
      },
    ]);
    expect(calls[0]?.headers.get("accept")).toBe(ACCEPT);
  });
});
