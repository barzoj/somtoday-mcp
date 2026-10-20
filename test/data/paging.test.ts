import { describe, expect, it } from "vitest";
import {
  ApiNotAvailableError,
  parseContentRange,
} from "../../src/api/client.js";
import { simplify, linkId } from "../../src/api/simplify.js";
import { ACCEPT, ACCEPT_JSON } from "../../src/constants.js";
import { eachDay, isoWeeksInRange, resolveRange } from "../../src/dates.js";
import { section } from "../../src/tools/result.js";
import { jsonResponse, routedFetch, toolContext } from "../helpers.js";

function pagedServer(total: number) {
  const all = Array.from({ length: total }, (_, index) => ({ n: index }));
  return routedFetch([
    [
      /\/things/,
      (_url, init) => {
        const range = new Headers(init?.headers).get("range");
        const match = /items=(\d+)-(\d+)/.exec(range ?? "");
        const start = Number(match?.[1] ?? 0);
        const end = Math.min(Number(match?.[2] ?? total - 1), total - 1);
        const items = all.slice(start, end + 1);
        return jsonResponse(
          206,
          { items },
          {
            "content-range":
              total === 0 ? "items 0-0/0" : `items ${start}-${end}/${total}`,
          },
        );
      },
    ],
  ]);
}

describe("getAll (Range paging)", () => {
  it("pages in steps of 100 until Content-Range says done", async () => {
    const { fetchFn, calls } = pagedServer(250);
    const ctx = await toolContext(fetchFn);
    const result = await ctx.client.getAll<{ n: number }>("/things");
    expect(result.items).toHaveLength(250);
    expect(result.total).toBe(250);
    expect(result.items.at(-1)?.n).toBe(249);
    expect(calls.map((call) => call.headers.get("range"))).toEqual([
      "items=0-99",
      "items=100-199",
      "items=200-299",
    ]);
    for (const call of calls) {
      expect(call.init?.method).toBe("GET");
    }
  });

  it("stops at maxItems", async () => {
    const { fetchFn, calls } = pagedServer(250);
    const ctx = await toolContext(fetchFn);
    const result = await ctx.client.getAll("/things", undefined, {
      maxItems: 30,
    });
    expect(result.items).toHaveLength(30);
    expect(result.total).toBe(250);
    expect(calls.map((call) => call.headers.get("range"))).toEqual([
      "items=0-29",
    ]);
  });

  it("handles an empty list and a response without Content-Range", async () => {
    const empty = pagedServer(0);
    const ctx = await toolContext(empty.fetchFn);
    expect((await ctx.client.getAll("/things")).items).toEqual([]);
    expect(empty.calls).toHaveLength(1);

    const plain = routedFetch([
      [/\/things/, () => jsonResponse(200, [{ a: 1 }, { a: 2 }])],
    ]);
    const ctx2 = await toolContext(plain.fetchFn);
    const result = await ctx2.client.getAll("/things");
    expect(result.items).toHaveLength(2);
    expect(plain.calls).toHaveLength(1);
  });

  it("parses Content-Range", () => {
    expect(parseContentRange("items 0-99/250")).toEqual({
      start: 0,
      end: 99,
      total: 250,
    });
    expect(parseContentRange("items 0-9/*")?.total).toBeUndefined();
    expect(parseContentRange(undefined)).toBeUndefined();
  });
});

describe("Accept per endpoint", () => {
  it("sends platinum by default and plain JSON when asked", async () => {
    const { fetchFn, calls } = routedFetch([
      [/./, () => jsonResponse(200, {})],
    ]);
    const ctx = await toolContext(fetchFn);
    await ctx.client.get("/a");
    await ctx.client.get("/b", undefined, { accept: "json" });
    expect(calls[0]?.headers.get("accept")).toBe(ACCEPT);
    expect(calls[1]?.headers.get("accept")).toBe(ACCEPT_JSON);
  });
});

describe("403 with a body", () => {
  it("is 'not available', not an auth error, and does not refresh", async () => {
    const { fetchFn, calls } = routedFetch([
      [/\/x/, () => jsonResponse(403, { message: "geen studiewijzer" })],
    ]);
    const ctx = await toolContext(fetchFn);
    await expect(ctx.client.get("/x")).rejects.toBeInstanceOf(
      ApiNotAvailableError,
    );
    expect(calls).toHaveLength(1);
    const marker = await section(() => ctx.client.get("/x"));
    expect(marker).toMatchObject({ available: false, status: 403 });
  });
});

describe("simplify", () => {
  it("drops links/permissions/$type, adds id, lifts additionals, strips HTML", () => {
    const value = {
      $type: "x.RThing",
      links: [{ id: 12, rel: "self", type: "x.RThing", href: "h" }],
      permissions: [{ full: "x" }],
      naam: "Thing",
      omschrijving: "<p>Hello&nbsp;<b>world</b></p>",
      leeg: [],
      niets: null,
      additionalObjects: {
        vaknaam: "Wiskunde",
        lijst: { $type: "LinkableWrapper", items: [1] },
      },
    };
    expect(linkId(value)).toBe(12);
    expect(simplify(value)).toEqual({
      id: 12,
      naam: "Thing",
      omschrijving: "Hello world",
      vaknaam: "Wiskunde",
      lijst: [1],
    });
  });
});

describe("date ranges", () => {
  it("resolves defaults, single dates and limits", () => {
    expect(resolveRange({}, { from: "2026-10-20", days: 7 }, 31)).toEqual({
      from: "2026-10-20",
      to: "2026-10-26",
    });
    expect(
      resolveRange({ date: "2026-10-21" }, { from: "2026-10-20", days: 7 }, 31),
    ).toEqual({ from: "2026-10-21", to: "2026-10-21" });
    expect(() =>
      resolveRange(
        { from: "2026-10-01", to: "2026-12-31" },
        { from: "2026-10-20", days: 7 },
        31,
      ),
    ).toThrow(/at most 31/);
    expect(() =>
      resolveRange(
        { from: "2026-10-05", to: "2026-10-01" },
        { from: "2026-10-20", days: 7 },
        31,
      ),
    ).toThrow(/before/);
  });

  it("lists days and ISO weeks across a year boundary", () => {
    expect(eachDay("2026-12-30", "2027-01-02")).toHaveLength(4);
    expect(isoWeeksInRange("2026-12-27", "2027-01-05")).toEqual([
      { year: 2026, week: 52 },
      { year: 2026, week: 53 },
      { year: 2027, week: 1 },
    ]);
  });
});
