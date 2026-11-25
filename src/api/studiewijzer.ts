import { htmlToPlain } from "../html.js";
import { linkId } from "./simplify.js";

/** Raw studiewijzer toekenning (afspraak/dag/week), as far as we read it. */
export type RawToekenning = {
  $type?: string;
  links?: unknown[];
  datumTijd?: string;
  weeknummerVanaf?: number;
  weeknummerTm?: number;
  sortering?: number;
  aangemaaktOpDatumTijd?: string;
  lesgroep?: RawLesgroep;
  studiewijzerItem?: RawStudiewijzerItem;
  additionalObjects?: {
    lesgroep?: RawLesgroep;
    studiewijzerId?: number;
    swigemaaktVinkjes?: { items?: RawGemaakt[] } | null;
    leerlingenMetInleveringStatus?: { items?: RawInleverStatus[] } | null;
    leerlingProjectgroep?: { items?: RawProjectgroep[] } | null;
  };
};

type RawLesgroep = {
  UUID?: string;
  naam?: string;
  omschrijving?: string;
  vak?: { UUID?: string; naam?: string; afkorting?: string };
};

export type RawAssembly = {
  assemblyFileType?: string;
  fileName?: string;
  fileUrl?: string;
  /** Older payloads carry the https link here instead of (or next to) `fileUrl`. */
  sslUrl?: string;
  fileSize?: number;
  fileExtension?: string;
  contentType?: string;
};

export type RawBijlage = {
  links?: unknown[];
  omschrijving?: string;
  sortering?: number;
  assemblyResults?: RawAssembly[];
  /**
   * Newer studiewijzer files: no assemblyResults, only a file record. The portal
   * opens `publicUrl` when set, else asks `/gcs/download/{bestanddataId}` for a
   * signed link.
   */
  bestand?: {
    links?: unknown[];
    bestandsnaam?: string;
    bestandsgrootte?: number;
    publicUrl?: string;
    bestanddataId?: string;
  };
};

export type RawExternMateriaal = {
  links?: unknown[];
  uri?: string;
  omschrijving?: string;
  sortering?: number;
};

type RawStudiewijzerItem = {
  links?: unknown[];
  onderwerp?: string;
  huiswerkType?: string;
  omschrijving?: string;
  leerdoelen?: string;
  tijdsindicatie?: string;
  notitie?: string;
  notitieZichtbaarVoorLeerling?: boolean;
  toetsSoort?: { naam?: string; afkorting?: string };
  lesmateriaal?: boolean;
  projectgroepen?: boolean;
  inleverperiodes?: boolean;
  tonen?: boolean;
  bijlagen?: RawBijlage[];
  externeMaterialen?: RawExternMateriaal[];
  inlevermomenten?: Array<{
    links?: unknown[];
    omschrijving?: string;
    startGeldigheid?: string;
    eindGeldigheid?: string;
    inleveringenAantal?: number;
    inleveringenVerwacht?: number;
    plagiaatDetectie?: boolean;
  }>;
};

type RawGemaakt = { leerling?: { links?: unknown[] }; gemaakt?: boolean };
type RawInleverStatus = {
  leerlingId?: number;
  status?: string;
  verzendDatum?: string;
};
type RawProjectgroep = {
  leerling?: { links?: unknown[] };
  projectgroepnaam?: string;
};

/**
 * Attachment as returned by every tool. Pass `fileUrl` or `bestanddataId` to
 * `download_attachment` to save the file.
 */
export type AttachmentView = {
  id?: number;
  naam: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  fileExtension?: string;
  type?: string;
  bestanddataId?: string;
};

export type LinkView = { omschrijving: string; uri: string };

export type StudiewijzerItemView = {
  toekenningId?: number;
  soort: "les" | "dag" | "week";
  datum?: string;
  datumTijd?: string;
  weekVanaf?: number;
  weekTm?: number;
  vak?: string;
  vakAfkorting?: string;
  vakUuid?: string;
  lesgroep?: string;
  huiswerkType: string;
  onderwerp?: string;
  omschrijving?: string;
  leerdoelen?: string;
  tijdsindicatie?: string;
  notitie?: string;
  toetsSoort?: string;
  lesmateriaal?: boolean;
  bijlagen: AttachmentView[];
  externeMaterialen: LinkView[];
  inlevermoment?: {
    start?: string;
    eind?: string;
    omschrijving?: string;
    inleveringenAantal?: number;
    inleveringenVerwacht?: number;
  };
  gemaakt?: boolean;
  inleverStatus?: string;
  inleverDatum?: string;
  projectgroep?: string;
  studiewijzerId?: number;
  sortering?: number;
};

/** Same file types the portal shows; previews and thumbnails are skipped. */
const FILE_TYPES = ["IMAGE", "VIDEO", "DOCUMENT", "MISC", "AUDIO"];

function extensionOf(fileName: string | undefined): string | undefined {
  return fileName?.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
}

function fromBestand(
  bijlage: RawBijlage,
  id: number | undefined,
): AttachmentView | undefined {
  const bestand = bijlage.bestand;
  // Prefer the file record when it carries a download key (portal order).
  // Name-only bestand records fall through so assemblyResults can still supply
  // fileUrl/sslUrl.
  if (!bestand?.publicUrl && !bestand?.bestanddataId) return undefined;
  const fileName = bestand.bestandsnaam;
  return {
    id,
    naam: bijlage.omschrijving?.trim() || fileName || "-",
    fileName,
    fileUrl: bestand.publicUrl || undefined,
    fileSize: bestand.bestandsgrootte,
    fileExtension: extensionOf(fileName),
    bestanddataId: bestand.bestanddataId || undefined,
  };
}

function fromAssembly(
  bijlage: RawBijlage,
  id: number | undefined,
): AttachmentView | undefined {
  const assembly =
    bijlage.assemblyResults?.find((result) =>
      FILE_TYPES.includes(result.assemblyFileType ?? ""),
    ) ?? bijlage.assemblyResults?.[0];
  const fileUrl = assembly?.fileUrl || assembly?.sslUrl || undefined;
  const naam = bijlage.omschrijving ?? assembly?.fileName;
  if (!naam && !fileUrl) return undefined;
  return {
    id,
    naam: naam ?? "-",
    fileName: assembly?.fileName,
    fileUrl,
    fileSize: assembly?.fileSize,
    fileExtension: assembly?.fileExtension,
    type: assembly?.assemblyFileType,
  };
}

function fromNameOnly(
  bijlage: RawBijlage,
  id: number | undefined,
): AttachmentView | undefined {
  const fileName = bijlage.bestand?.bestandsnaam;
  const naam = bijlage.omschrijving?.trim() || fileName;
  if (!naam) return undefined;
  return {
    id,
    naam,
    fileName,
    fileSize: bijlage.bestand?.bestandsgrootte,
    fileExtension: extensionOf(fileName),
  };
}

export function mapAttachment(bijlage: RawBijlage): AttachmentView | undefined {
  const id = linkId(bijlage);
  return (
    fromBestand(bijlage, id) ??
    fromAssembly(bijlage, id) ??
    fromNameOnly(bijlage, id)
  );
}

export function mapLink(materiaal: RawExternMateriaal): LinkView | undefined {
  if (!materiaal.uri) return undefined;
  return {
    omschrijving: materiaal.omschrijving || materiaal.uri,
    uri: materiaal.uri,
  };
}

function soortOf(raw: RawToekenning): StudiewijzerItemView["soort"] {
  const type = raw.$type ?? "";
  if (type.includes("Week") || raw.weeknummerVanaf !== undefined) return "week";
  if (type.includes("Afspraak")) return "les";
  return "dag";
}

function plain(html: string | undefined): string | undefined {
  const text = htmlToPlain(html);
  return text || undefined;
}

/** Every field the portal shows for a studiewijzer item, for one child. */
export function mapStudiewijzerItem(
  raw: RawToekenning,
  leerlingId: number,
  dayOf: (value: string) => string,
): StudiewijzerItemView {
  const item = raw.studiewijzerItem ?? {};
  const lesgroep = raw.additionalObjects?.lesgroep ?? raw.lesgroep;
  const moment = item.inlevermomenten?.[0];
  const gemaakt = raw.additionalObjects?.swigemaaktVinkjes?.items?.find(
    (entry) => linkId(entry.leerling) === leerlingId,
  )?.gemaakt;
  const status =
    raw.additionalObjects?.leerlingenMetInleveringStatus?.items?.find(
      (entry) => entry.leerlingId === leerlingId,
    );
  const projectgroep = raw.additionalObjects?.leerlingProjectgroep?.items?.find(
    (entry) => linkId(entry.leerling) === leerlingId,
  )?.projectgroepnaam;
  const notitie =
    item.notitieZichtbaarVoorLeerling === false
      ? undefined
      : plain(item.notitie);
  return {
    toekenningId: linkId(raw),
    soort: soortOf(raw),
    datum: raw.datumTijd ? dayOf(raw.datumTijd) : undefined,
    datumTijd: raw.datumTijd,
    weekVanaf: raw.weeknummerVanaf,
    weekTm: raw.weeknummerTm,
    vak: lesgroep?.vak?.naam ?? lesgroep?.naam,
    vakAfkorting: lesgroep?.vak?.afkorting,
    vakUuid: lesgroep?.vak?.UUID,
    lesgroep: lesgroep?.naam,
    huiswerkType: item.huiswerkType ?? "HUISWERK",
    onderwerp: item.onderwerp,
    omschrijving: plain(item.omschrijving),
    leerdoelen: plain(item.leerdoelen),
    tijdsindicatie: item.tijdsindicatie || undefined,
    notitie,
    toetsSoort: item.toetsSoort?.naam,
    lesmateriaal: item.lesmateriaal,
    bijlagen: (item.bijlagen ?? [])
      .map(mapAttachment)
      .filter((value): value is AttachmentView => Boolean(value)),
    externeMaterialen: (item.externeMaterialen ?? [])
      .map(mapLink)
      .filter((value): value is LinkView => Boolean(value)),
    inlevermoment: moment
      ? {
          start: moment.startGeldigheid,
          eind: moment.eindGeldigheid,
          omschrijving: plain(moment.omschrijving),
          inleveringenAantal: moment.inleveringenAantal,
          inleveringenVerwacht: moment.inleveringenVerwacht,
        }
      : undefined,
    gemaakt,
    inleverStatus: status?.status,
    inleverDatum: status?.verzendDatum,
    projectgroep,
    studiewijzerId: raw.additionalObjects?.studiewijzerId,
    sortering: raw.sortering,
  };
}

/** Drop undefined fields and empty arrays so JSON output stays compact. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, inner]) =>
        inner !== undefined && !(Array.isArray(inner) && inner.length === 0),
    ),
  ) as T;
}

/**
 * Like `compact`, but always keeps `bijlagen` and `externeMaterialen` so an
 * empty list visibly means "no files/links" (the portal has no other call
 * for an item's material; `lesmateriaal` is only a flag).
 */
export function compactItem<
  T extends Pick<StudiewijzerItemView, "bijlagen" | "externeMaterialen">,
>(value: T): T {
  return {
    ...compact(value),
    bijlagen: value.bijlagen,
    externeMaterialen: value.externeMaterialen,
  };
}
