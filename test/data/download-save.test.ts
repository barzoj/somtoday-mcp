// download_attachment: saving to disk and bestanddataId via /gcs/download.
// Synthetic fixtures only; no real files or accounts.
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadDir,
  resolveBestanddataUrl,
  sanitizeFileName,
} from "../../src/api/download.js";
import { mapAttachment } from "../../src/api/studiewijzer.js";
import { downloadAttachmentTool } from "../../src/tools/download.js";
import { minimalPdf, routedFetch, toolContext, toolJson } from "../helpers.js";

let dir: string;
const previous = process.env.SOMTODAY_MCP_DOWNLOAD_DIR;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "somtoday-dl-"));
  process.env.SOMTODAY_MCP_DOWNLOAD_DIR = dir;
});
afterEach(() => {
  process.env.SOMTODAY_MCP_DOWNLOAD_DIR = previous;
});

describe("mapAttachment", () => {
  it("keeps id, name, size and bestanddataId of a file-record bijlage (no assemblyResults)", () => {
    expect(
      mapAttachment({
        links: [{ id: 5501, rel: "self" }],
        omschrijving: "",
        bestand: {
          bestandsnaam: "Lesstof H3.DOCX",
          bestandsgrootte: 2048,
          bestanddataId: "b7f1c2d4-0000-4000-8000-000000000001",
        },
      }),
    ).toEqual({
      id: 5501,
      naam: "Lesstof H3.DOCX",
      fileName: "Lesstof H3.DOCX",
      fileSize: 2048,
      fileExtension: "docx",
      bestanddataId: "b7f1c2d4-0000-4000-8000-000000000001",
      fileUrl: undefined,
    });
  });

  it("uses the public url of a file record when present", () => {
    expect(
      mapAttachment({
        omschrijving: "Werkblad",
        bestand: {
          bestandsnaam: "werkblad.pdf",
          publicUrl: "https://files.somtoday.nl/p/werkblad.pdf",
        },
      }),
    ).toMatchObject({
      naam: "Werkblad",
      fileUrl: "https://files.somtoday.nl/p/werkblad.pdf",
      fileExtension: "pdf",
    });
  });

  it("falls back to sslUrl on assembly results", () => {
    expect(
      mapAttachment({
        links: [{ id: 9, rel: "koppeling" }],
        assemblyResults: [
          {
            assemblyFileType: "DOCUMENT",
            fileName: "a.pdf",
            sslUrl: "https://files.somtoday.nl/a.pdf",
          },
        ],
      }),
    ).toMatchObject({
      id: 9,
      naam: "a.pdf",
      fileUrl: "https://files.somtoday.nl/a.pdf",
    });
  });

  it("prefers a downloadable bestand over assemblyResults", () => {
    expect(
      mapAttachment({
        omschrijving: "Beide",
        bestand: {
          bestandsnaam: "nieuw.pdf",
          bestanddataId: "id-nieuw",
        },
        assemblyResults: [
          {
            assemblyFileType: "DOCUMENT",
            fileName: "oud.pdf",
            fileUrl: "https://files.somtoday.nl/oud.pdf",
          },
        ],
      }),
    ).toMatchObject({
      fileName: "nieuw.pdf",
      bestanddataId: "id-nieuw",
      fileUrl: undefined,
    });
  });

  it("uses assemblyResults when bestand is name-only (no download key)", () => {
    expect(
      mapAttachment({
        omschrijving: "Gemengd",
        bestand: { bestandsnaam: "naamloos.pdf" },
        assemblyResults: [
          {
            assemblyFileType: "DOCUMENT",
            fileName: "echt.pdf",
            fileUrl: "https://files.somtoday.nl/echt.pdf",
          },
        ],
      }),
    ).toMatchObject({
      naam: "Gemengd",
      fileName: "echt.pdf",
      fileUrl: "https://files.somtoday.nl/echt.pdf",
      type: "DOCUMENT",
    });
  });

  it("skips PREVIEW/THUMBNAIL assemblies instead of treating them as downloads", () => {
    const view = mapAttachment({
      omschrijving: "Alleen preview",
      assemblyResults: [
        {
          assemblyFileType: "PREVIEW",
          fileName: "thumb.png",
          fileUrl: "https://files.somtoday.nl/thumb.png",
        },
        {
          assemblyFileType: "THUMBNAIL",
          fileUrl: "https://files.somtoday.nl/tiny.png",
        },
      ],
    });
    expect(view?.naam).toBe("Alleen preview");
    expect(view?.fileUrl).toBeUndefined();
    expect(view?.bestanddataId).toBeUndefined();
    expect(view?.type).toBeUndefined();
  });

  it("keeps an untyped assembly with a download URL (not a preview)", () => {
    expect(
      mapAttachment({
        assemblyResults: [
          {
            fileName: "los.pdf",
            fileUrl: "https://files.somtoday.nl/los.pdf",
          },
        ],
      }),
    ).toMatchObject({
      naam: "los.pdf",
      fileUrl: "https://files.somtoday.nl/los.pdf",
    });
  });

  it("uses a placeholder naam when a downloadable file has no name", () => {
    expect(
      mapAttachment({
        bestand: {
          publicUrl: "https://files.somtoday.nl/anon",
          bestanddataId: "id-anon",
        },
      }),
    ).toMatchObject({
      naam: "-",
      fileUrl: "https://files.somtoday.nl/anon",
      bestanddataId: "id-anon",
    });
    expect(
      mapAttachment({
        assemblyResults: [
          {
            assemblyFileType: "DOCUMENT",
            sslUrl: "https://files.somtoday.nl/noname.bin",
          },
        ],
      }),
    ).toMatchObject({
      naam: "-",
      fileUrl: "https://files.somtoday.nl/noname.bin",
      type: "DOCUMENT",
    });
  });

  it("returns undefined for an empty bijlage and keeps extension-less file names", () => {
    expect(mapAttachment({})).toBeUndefined();
    expect(
      mapAttachment({
        bestand: {
          bestandsnaam: "README",
          bestanddataId: "id-readme",
        },
      }),
    ).toMatchObject({
      fileName: "README",
      fileExtension: undefined,
      bestanddataId: "id-readme",
    });
  });
});

describe("sanitizeFileName", () => {
  it("strips directories, reserved characters and leading dots", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("..\\..\\boot.ini")).toBe("boot.ini");
    expect(sanitizeFileName('a<b>:c"d|e?f*.pdf')).toBe("a_b__c_d_e_f_.pdf");
    expect(sanitizeFileName(".hidden")).toBe("hidden");
    expect(sanitizeFileName("CON.txt")).toBe("_CON.txt");
    expect(sanitizeFileName("x\u0000y.pdf")).toBe("x_y.pdf");
    expect(sanitizeFileName("")).toBe("attachment");
    expect(sanitizeFileName(undefined)).toBe("attachment");
    const long = sanitizeFileName(`${"a".repeat(300)}.docx`);
    expect(long).toHaveLength(150);
    expect(long.endsWith(".docx")).toBe(true);
  });

  it("uses SOMTODAY_MCP_DOWNLOAD_DIR, else ~/Downloads/somtoday-mcp", () => {
    expect(downloadDir("/tmp/x")).toBe("/tmp/x");
    expect(downloadDir("")).toMatch(/Downloads[\\/]somtoday-mcp$/);
  });
});

describe("download_attachment saves metadata only", () => {
  it("saves a file from a fileUrl without extracting text, never overwriting", async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const url = "https://files.somtoday.nl/bijlage/1/Lesstof%20H3.docx";
    const { fetchFn, calls } = routedFetch([
      [
        /\/bijlage\/1\//,
        () =>
          new Response(body, {
            headers: {
              "content-type":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            },
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const first = toolJson(await downloadAttachmentTool(ctx, { url }));
    const second = toolJson(await downloadAttachmentTool(ctx, { url }));
    expect(first).toMatchObject({
      fileName: "Lesstof H3.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      savedPath: join(dir, "Lesstof H3.docx"),
      bytes: 5,
    });
    expect(first.text).toBeUndefined();
    expect(second.savedPath).toBe(join(dir, "Lesstof H3 (1).docx"));
    expect(await readFile(first.savedPath as string)).toEqual(
      Buffer.from(body),
    );
    expect((await stat(first.savedPath as string)).size).toBe(5);
    expect(calls[0]?.headers.get("authorization")).toBeNull();
  });

  it("skips the file with save=false and still returns metadata", async () => {
    const url = "https://files.somtoday.nl/x/werkblad.pdf";
    const { fetchFn } = routedFetch([
      [
        /werkblad\.pdf/,
        () =>
          new Response(minimalPdf("Opdracht"), {
            headers: { "content-type": "application/pdf" },
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const noSave = toolJson(
      await downloadAttachmentTool(ctx, { url, save: false }),
    );
    expect(noSave.savedPath).toBeUndefined();
    expect(noSave.text).toBeUndefined();
    expect(noSave.contentType).toBe("application/pdf");
    expect(await readdir(dir)).toEqual([]);
  });

  it("gets a signed link for a bestanddataId with the token, then fetches it without one", async () => {
    const id = "b7f1c2d4-0000-4000-8000-000000000001";
    const signed =
      "https://storage.example.test/bucket/obj-123?X-Goog-Signature=abc";
    const body = new TextEncoder().encode("binary-payload");
    const { fetchFn, calls } = routedFetch([
      [
        new RegExp(`/gcs/download/${id}$`),
        () =>
          new Response(signed, { headers: { "content-type": "text/plain" } }),
      ],
      [
        /\/bucket\/obj-123/,
        () =>
          new Response(body, {
            headers: { "content-type": "application/octet-stream" },
          }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await downloadAttachmentTool(ctx, {
        bestanddataId: id,
        fileName: "Lesstof H3.docx",
      }),
    );
    expect(out).toMatchObject({
      bestanddataId: id,
      host: "storage.example.test",
      fileName: "Lesstof H3.docx",
      savedPath: join(dir, "Lesstof H3.docx"),
      bytes: body.byteLength,
    });
    expect(out.text).toBeUndefined();
    const api = calls.find((call) => call.url.pathname.includes("/gcs/"));
    const file = calls.find((call) => call.url.pathname.includes("/bucket/"));
    expect(api?.headers.get("authorization")).toMatch(/^Bearer /);
    expect(file?.headers.get("authorization")).toBeNull();
  });

  it("prefers bestanddataId when the fileUrl host is not allow-listed", async () => {
    const { fetchFn, calls } = routedFetch([
      [
        /\/gcs\/download\/abc$/,
        () => new Response('"https://storage.example.test/o/1"'),
      ],
      [
        /\/o\/1$/,
        () =>
          new Response("hallo", { headers: { "content-type": "text/plain" } }),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    const out = toolJson(
      await downloadAttachmentTool(ctx, {
        url: "https://cdn.other.test/file.txt",
        bestanddataId: "abc",
        save: false,
      }),
    );
    expect(out).toMatchObject({
      contentType: "text/plain",
      bytes: 5,
      host: "storage.example.test",
    });
    expect(out.text).toBeUndefined();
    expect(calls.some((call) => call.url.hostname === "cdn.other.test")).toBe(
      false,
    );
  });

  it("rejects a non-https signed link and a missing argument", async () => {
    const { fetchFn } = routedFetch([
      [
        /\/gcs\/download\/abc$/,
        () => new Response("http://plain.example.test/x"),
      ],
    ]);
    const ctx = await toolContext(fetchFn);
    await expect(resolveBestanddataUrl(ctx.client, "abc")).rejects.toThrow(
      /unexpected download link/,
    );
    await expect(resolveBestanddataUrl(ctx.client, "../x")).rejects.toThrow(
      /invalid bestanddataId/,
    );
    const none = await downloadAttachmentTool(ctx, {});
    expect(none.isError).toBe(true);
  });
});
