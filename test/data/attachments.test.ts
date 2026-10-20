// Every place the portal shows files or links must keep them, with the
// download URL as `fileUrl` (for download_attachment). Synthetic fixtures.
import { describe, expect, it } from "vitest";
import { mapMessage } from "../../src/api/messages.js";
import { mapScheduleItem } from "../../src/api/schedule.js";
import {
  compactItem,
  mapStudiewijzerItem,
  type RawToekenning,
} from "../../src/api/studiewijzer.js";
import { LEERLING, handIn, toekenning } from "../fixtures/studiewijzer.js";

const day = (value: string) => value.slice(0, 10);

const bijlage = (name: string) => ({
  links: [{ id: 7100, rel: "self" }],
  omschrijving: name,
  assemblyResults: [
    {
      assemblyFileType: "PREVIEW",
      fileUrl: "https://files.example.test/preview.png",
    },
    {
      assemblyFileType: "DOCUMENT",
      fileName: `${name}.pdf`,
      fileUrl: `https://files.example.test/${name}.pdf`,
      fileSize: 1234,
      fileExtension: "pdf",
    },
  ],
});

describe("attachments on studiewijzer items", () => {
  it("keeps an assignment's own instruction files and links", () => {
    const raw = handIn(
      31,
      "2026-10-01T08:00:00Z",
      "2026-10-30T22:00:00Z",
    ) as RawToekenning;
    raw.studiewijzerItem = {
      ...raw.studiewijzerItem,
      bijlagen: [bijlage("opdracht")],
      externeMaterialen: [
        { uri: "https://site.example.test/bron", omschrijving: "Bron" },
      ],
    } as RawToekenning["studiewijzerItem"];
    const view = compactItem(mapStudiewijzerItem(raw, LEERLING, day));
    expect(view.bijlagen).toEqual([
      {
        naam: "opdracht",
        fileName: "opdracht.pdf",
        fileUrl: "https://files.example.test/opdracht.pdf",
        fileSize: 1234,
        fileExtension: "pdf",
        type: "DOCUMENT",
      },
    ]);
    expect(view.externeMaterialen).toEqual([
      { omschrijving: "Bron", uri: "https://site.example.test/bron" },
    ]);
    expect(view.inlevermoment?.eind).toBe("2026-10-30T22:00:00Z");
  });

  it("lists bijlagen and externeMaterialen as empty arrays for lesmateriaal items without files", () => {
    const raw = toekenning(
      "Afspraak",
      32,
      { datumTijd: "2026-10-21T08:00:00Z" },
      {
        huiswerkType: "LESSTOF",
        lesmateriaal: true,
        bijlagen: [],
        externeMaterialen: [],
      },
    ) as RawToekenning;
    const view = compactItem(mapStudiewijzerItem(raw, LEERLING, day));
    expect(view).toMatchObject({
      huiswerkType: "LESSTOF",
      lesmateriaal: true,
      bijlagen: [],
      externeMaterialen: [],
    });
  });

  it("falls back to the stored file name when there is no assembly result", () => {
    const raw = toekenning(
      "Dag",
      33,
      { datumTijd: "2026-10-21T08:00:00Z" },
      {
        bijlagen: [{ bestand: { bestandsnaam: "oud.docx" } }],
      },
    ) as RawToekenning;
    const [file] = mapStudiewijzerItem(raw, LEERLING, day).bijlagen;
    expect(file).toMatchObject({ naam: "oud.docx", fileName: "oud.docx" });
    expect(file?.fileUrl).toBeUndefined();
  });
});

describe("attachments elsewhere", () => {
  it("keeps lesson (afspraak) bijlagen", () => {
    const view = mapScheduleItem({
      beginDatumTijd: "2026-10-21T08:00:00Z",
      eindDatumTijd: "2026-10-21T08:50:00Z",
      bijlagen: [bijlage("les")],
    } as Parameters<typeof mapScheduleItem>[0]);
    expect(view.bijlagen?.[0]?.fileUrl).toBe(
      "https://files.example.test/les.pdf",
    );
  });

  it("keeps message bijlages", () => {
    const view = mapMessage({
      inhoud: "<p>Zie bijlage</p>",
      bijlages: [bijlage("brief")],
    } as Parameters<typeof mapMessage>[0]);
    expect(
      (view as { bijlagen: Array<{ fileUrl?: string }> }).bijlagen[0]?.fileUrl,
    ).toBe("https://files.example.test/brief.pdf");
  });
});
