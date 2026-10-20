import { amsterdamYmd } from "../dates.js";
import type { ApiClient } from "./client.js";
import { linkId } from "./simplify.js";
import {
  compact,
  mapAttachment,
  mapLink,
  mapStudiewijzerItem,
  type AttachmentView,
  type LinkView,
  type RawBijlage,
  type RawExternMateriaal,
  type RawToekenning,
  type StudiewijzerItemView,
} from "./studiewijzer.js";

export type SubjectRef = { naam?: string; afkorting?: string; uuid: string };

type RawVak = { UUID?: string; naam?: string; afkorting?: string };
type RawMap = { links?: unknown[]; naam?: string; sortering?: number };
type RawMethode = { naam?: string; uitgevernaam?: string };
type RawMethodeInfo = { methode?: string; uitgever?: string };
type RawStudieMateriaal = {
  lesstof?: RawToekenning[];
  jaarBijlagenMappen?: RawMap[];
  jaarBijlagen?: Array<RawBijlage & { jaarbijlageMap?: RawMap }>;
  externMateriaal?: Array<RawExternMateriaal & { jaarbijlageMap?: RawMap }>;
  leermiddelKeuzes?: Array<{
    UUID?: string;
    leermiddel?: {
      UUID?: string;
      titel?: string;
      url?: string;
      methode?: RawMethode;
      methodeInformatie?: RawMethodeInfo;
    };
  }>;
};
type RawUserProduct = {
  UUID?: string;
  product?: {
    UUID?: string;
    title?: string;
    url?: string;
    methodeInformatie?: RawMethodeInfo;
  };
};

export type LeermiddelView = {
  titel?: string;
  url?: string;
  methode?: string;
  uitgever?: string;
  soort: "boekenfonds" | "persoonlijk";
};

export type SubjectMaterialView = {
  vak: SubjectRef;
  /** Lesson material (huiswerkType LESSTOF etc.) from the study planner, by date. */
  lesstof: StudiewijzerItemView[];
  mappen: string[];
  jaarBijlagen: Array<AttachmentView & { map?: string }>;
  externMateriaal: Array<LinkView & { map?: string }>;
  leermiddelen: LeermiddelView[];
};

export async function fetchSubjectsWithMaterial(
  client: ApiClient,
  leerlingId: number,
): Promise<SubjectRef[]> {
  const { items } = await client.getAll<RawVak>(
    `/vakken/studiemateriaal/${leerlingId}`,
  );
  return items
    .filter((vak): vak is RawVak & { UUID: string } => Boolean(vak.UUID))
    .map((vak) =>
      compact({ naam: vak.naam, afkorting: vak.afkorting, uuid: vak.UUID }),
    )
    .sort((a, b) => (a.naam ?? "").localeCompare(b.naam ?? ""));
}

/** Match a subject by UUID, abbreviation, or (part of) its name. */
export function findSubject(subjects: SubjectRef[], query: string): SubjectRef {
  const needle = query.trim().toLowerCase();
  const exact = subjects.find(
    (subject) =>
      subject.uuid.toLowerCase() === needle ||
      subject.afkorting?.toLowerCase() === needle ||
      subject.naam?.toLowerCase() === needle,
  );
  if (exact) return exact;
  const partial = subjects.filter((subject) =>
    subject.naam?.toLowerCase().includes(needle),
  );
  if (partial.length === 1) return partial[0]!;
  const options = subjects
    .map((subject) => `${subject.naam ?? "?"} (${subject.afkorting ?? "-"})`)
    .join(", ");
  throw new Error(
    partial.length > 1
      ? `Several subjects match "${query}": ${partial.map((s) => s.naam).join(", ")}`
      : `No subject matches "${query}". Subjects: ${options || "none"}`,
  );
}

export async function fetchSubjectMaterial(
  client: ApiClient,
  leerlingId: number,
  vak: SubjectRef,
): Promise<SubjectMaterialView> {
  const { body } = await client.get<RawStudieMateriaal>(
    `/studiemateriaal/${leerlingId}/vak/${vak.uuid}`,
  );
  const mapName = (map?: RawMap) => map?.naam;
  return {
    vak,
    lesstof: (body.lesstof ?? [])
      .filter((raw) => raw.studiewijzerItem)
      .map((raw) => compact(mapStudiewijzerItem(raw, leerlingId, amsterdamYmd)))
      .sort(
        (a, b) =>
          (a.datumTijd ?? "").localeCompare(b.datumTijd ?? "") ||
          (a.weekVanaf ?? 0) - (b.weekVanaf ?? 0),
      ),
    mappen: [...(body.jaarBijlagenMappen ?? [])]
      .sort((a, b) => (a.sortering ?? 0) - (b.sortering ?? 0))
      .map((map) => map.naam ?? String(linkId(map) ?? "?")),
    jaarBijlagen: (body.jaarBijlagen ?? []).flatMap((bijlage) => {
      const view = mapAttachment(bijlage);
      return view
        ? [compact({ ...view, map: mapName(bijlage.jaarbijlageMap) })]
        : [];
    }),
    externMateriaal: (body.externMateriaal ?? []).flatMap((materiaal) => {
      const view = mapLink(materiaal);
      return view
        ? [compact({ ...view, map: mapName(materiaal.jaarbijlageMap) })]
        : [];
    }),
    leermiddelen: (body.leermiddelKeuzes ?? []).map((keuze) =>
      compact({
        titel: keuze.leermiddel?.titel,
        url: keuze.leermiddel?.url,
        methode:
          keuze.leermiddel?.methode?.naam ??
          keuze.leermiddel?.methodeInformatie?.methode,
        uitgever:
          keuze.leermiddel?.methode?.uitgevernaam ??
          keuze.leermiddel?.methodeInformatie?.uitgever,
        soort: "boekenfonds" as const,
      }),
    ),
  };
}

/** Personal digital learning products (EduRoute). The portal skips this for parents; the API may answer 403. */
export async function fetchPersonalProducts(
  client: ApiClient,
  leerlingId: number,
): Promise<LeermiddelView[]> {
  const { items } = await client.getAll<RawUserProduct>(
    `/studiemateriaal/algemeen/${leerlingId}`,
  );
  return items.map((item) =>
    compact({
      titel: item.product?.title,
      url: item.product?.url,
      methode: item.product?.methodeInformatie?.methode,
      uitgever: item.product?.methodeInformatie?.uitgever,
      soort: "persoonlijk" as const,
    }),
  );
}

/** Run tasks with a small concurrency limit (keeps the API load polite). */
export async function mapLimited<T, R>(
  values: T[],
  limit: number,
  run: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, values.length) },
    async () => {
      while (next < values.length) {
        const index = next++;
        results[index] = await run(values[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
