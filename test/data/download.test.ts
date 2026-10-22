import { describe, expect, it } from "vitest";
import { downloadAttachment, isAllowedUrl } from "../../src/api/download.js";
import { downloadAttachmentTool } from "../../src/tools/download.js";
import { minimalPdf, toolContext } from "../helpers.js";

type Call = { url: string; init?: RequestInit };

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    return route ? route() : new Response("missing", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const FILE = "https://files.somtoday.nl/bijlage/abc/werkblad.pdf";

describe("attachment allow-list", () => {
  it("allows https Somtoday hosts and env extensions only", () => {
    expect(isAllowedUrl(FILE, "")).toBe(true);
    expect(isAllowedUrl("https://somtoday.nl.evil.test/x", "")).toBe(false);
    expect(isAllowedUrl("https://evilsomtoday.nl/x", "")).toBe(false);
    expect(isAllowedUrl("http://files.somtoday.nl/x", "")).toBe(false);
    expect(isAllowedUrl("https://user@files.somtoday.nl/x", "")).toBe(false);
    expect(isAllowedUrl("https://files.somtoday.nl:8443/x", "")).toBe(false);
    expect(isAllowedUrl("https://cdn.example.test/x", "")).toBe(false);
    expect(isAllowedUrl("https://cdn.example.test/x", "cdn.example.test")).toBe(
      true,
    );
    expect(
      isAllowedUrl("https://a.cdn.example.test/x", ".cdn.example.test"),
    ).toBe(true);
  });
});

describe("downloadAttachment", () => {
  it("extracts PDF text without sending a token", async () => {
    const { fetchFn, calls } = fakeFetch({
      [FILE]: () =>
        new Response(minimalPdf("Opdracht 1 maken"), {
          headers: { "content-type": "application/pdf" },
        }),
    });
    const out = await downloadAttachment(fetchFn, FILE, { env: "" });
    expect(out).toMatchObject({
      host: "files.somtoday.nl",
      contentType: "application/pdf",
      fileName: "werkblad.pdf",
      pages: 1,
    });
    expect(out.text).toContain("Opdracht 1 maken");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(
      new Headers(calls[0]?.init?.headers).get("authorization"),
    ).toBeNull();
    expect(calls[0]?.init?.redirect).toBe("manual");
  });

  it("converts HTML and keeps CSV/text", async () => {
    const { fetchFn } = fakeFetch({
      [FILE]: () =>
        new Response("<p>Hallo <b>wereld</b></p>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      "https://files.somtoday.nl/a.csv": () =>
        new Response("a;b\n1;2", { headers: { "content-type": "text/csv" } }),
    });
    expect((await downloadAttachment(fetchFn, FILE, { env: "" })).text).toBe(
      "Hallo wereld",
    );
    expect(
      (
        await downloadAttachment(fetchFn, "https://files.somtoday.nl/a.csv", {
          env: "",
        })
      ).text,
    ).toBe("a;b\n1;2");
  });

  it("follows redirects only to allowed hosts", async () => {
    const { fetchFn, calls } = fakeFetch({
      [FILE]: () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example.test/steal" },
        }),
    });
    await expect(
      downloadAttachment(fetchFn, FILE, { env: "" }),
    ).rejects.toThrow(/not allowed/);
    expect(calls).toHaveLength(1);
  });

  it("enforces the size cap from content-length and while streaming", async () => {
    const { fetchFn } = fakeFetch({
      [FILE]: () =>
        new Response("x".repeat(50), {
          headers: { "content-length": "999999", "content-type": "text/plain" },
        }),
      "https://files.somtoday.nl/stream": () =>
        new Response("y".repeat(2048), {
          headers: { "content-type": "text/plain" },
        }),
    });
    await expect(
      downloadAttachment(fetchFn, FILE, { env: "", maxBytes: 1024 }),
    ).rejects.toThrow(/larger than/);
    await expect(
      downloadAttachment(fetchFn, "https://files.somtoday.nl/stream", {
        env: "",
        maxBytes: 1024,
      }),
    ).rejects.toThrow(/larger than/);
  });

  it("returns metadata for binary files", async () => {
    const { fetchFn } = fakeFetch({
      [FILE]: () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "content-type": "image/png",
            "content-disposition": 'attachment; filename="foto.png"',
          },
        }),
    });
    expect(await downloadAttachment(fetchFn, FILE, { env: "" })).toMatchObject({
      contentType: "image/png",
      fileName: "foto.png",
      bytes: 3,
      note: expect.stringMatching(/binary/),
    });
  });
});

describe("download_attachment tool", () => {
  it("rejects disallowed hosts as a tool error without fetching", async () => {
    const { fetchFn, calls } = fakeFetch({});
    const ctx = await toolContext(fetchFn);
    const result = await downloadAttachmentTool(ctx, {
      url: "https://evil.example.test/x",
    });
    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
