import { describe, expect, it } from "vitest";
import { fetchSchools } from "../../src/auth/school.js";
import { SCHOOLS_MIRROR_URL, SCHOOLS_URL } from "../../src/constants.js";
import { jsonResponse, scriptedFetch } from "../helpers.js";

const payload = [
  {
    instellingen: [
      {
        uuid: "11111111-1111-4111-8111-111111111111",
        naam: "Fixture College",
        plaats: "TESTSTAD",
      },
    ],
  },
];

describe("school list", () => {
  it("uses the official URL when it returns JSON", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () => jsonResponse(200, payload),
    ]);
    const schools = await fetchSchools(fetchFn);
    expect(schools).toEqual([
      {
        uuid: "11111111-1111-4111-8111-111111111111",
        naam: "Fixture College",
        plaats: "TESTSTAD",
      },
    ]);
    expect(calls.map((call) => call.url)).toEqual([SCHOOLS_URL]);
  });

  it("falls back to the public mirror when the official host redirects", async () => {
    const { fetchFn, calls } = scriptedFetch([
      async () =>
        new Response(null, {
          status: 301,
          headers: { location: "https://inloggen.somtoday.nl" },
        }),
      async () => jsonResponse(200, payload),
    ]);
    const schools = await fetchSchools(fetchFn);
    expect(schools[0]?.naam).toBe("Fixture College");
    expect(calls.map((call) => call.url)).toEqual([
      SCHOOLS_URL,
      SCHOOLS_MIRROR_URL,
    ]);
  });

  it("falls back when official fetch throws, and surfaces the cause if both fail", async () => {
    const { fetchFn } = scriptedFetch([
      async () => {
        throw new TypeError("fetch failed", { cause: new Error("ECONNRESET") });
      },
      async () => jsonResponse(200, payload),
    ]);
    expect((await fetchSchools(fetchFn))[0]?.naam).toBe("Fixture College");

    const failing = scriptedFetch([
      async () => {
        throw new TypeError("fetch failed", { cause: new Error("ENOTFOUND") });
      },
      async () => {
        throw new TypeError("fetch failed", { cause: new Error("ENETUNREACH") });
      },
    ]);
    await expect(fetchSchools(failing.fetchFn)).rejects.toThrow(
      /School list failed.*ENOTFOUND.*ENETUNREACH/,
    );
  });
});
