import { amsterdamYmd } from "../dates.js";
import { htmlToPlain } from "../html.js";
import type { ApiClient } from "./client.js";
import { handInQuery } from "./homework.js";
import { linkId } from "./simplify.js";
import {
  compact,
  compactItem,
  mapAttachment,
  mapStudiewijzerItem,
  type AttachmentView,
  type RawAssembly,
  type RawBijlage,
  type RawToekenning,
  type StudiewijzerItemView,
} from "./studiewijzer.js";

export type AssignmentCategory =
  "AANKOMEND" | "IN_TE_LEVEREN" | "IN_AFWACHTING" | "AKKOORD";

export type AssignmentView = StudiewijzerItemView & {
  categorie?: AssignmentCategory;
  teLaat?: boolean;
};

/** Same buckets as the portal's assignment list. */
export function categorize(
  item: StudiewijzerItemView,
  now: Date,
): { categorie?: AssignmentCategory; teLaat?: boolean } {
  const start = item.inlevermoment?.start
    ? new Date(item.inlevermoment.start)
    : undefined;
  const eind = item.inlevermoment?.eind
    ? new Date(item.inlevermoment.eind)
    : undefined;
  if (!start) return {};
  if (start > now) return { categorie: "AANKOMEND" };
  const status = item.inleverStatus;
  if (!status || status === "HEROPEND") {
    return {
      categorie: "IN_TE_LEVEREN",
      teLaat: eind ? eind < now : undefined,
    };
  }
  if (status === "TE_BEOORDELEN" || status === "IN_BEHANDELING") {
    return { categorie: "IN_AFWACHTING" };
  }
  if (status === "AKKOORD") return { categorie: "AKKOORD" };
  return {};
}

export async function fetchAssignments(
  client: ApiClient,
  leerlingId: number,
  now: Date,
): Promise<AssignmentView[]> {
  const { items } = await client.getAll<RawToekenning>(
    "/studiewijzeritemdagtoekenningen",
    handInQuery(leerlingId),
  );
  return (
    items
      .map((raw) => ({
        raw,
        view: mapStudiewijzerItem(raw, leerlingId, amsterdamYmd),
      }))
      // Like the portal: group assignments only count once the child is in a group.
      .filter(
        ({ raw, view }) =>
          !(raw.studiewijzerItem?.projectgroepen && !view.projectgroep),
      )
      .map(({ view }) => compactItem({ ...view, ...categorize(view, now) }))
      .sort((a, b) =>
        (a.inlevermoment?.eind ?? "").localeCompare(
          b.inlevermoment?.eind ?? "",
        ),
      )
  );
}

type RawInlevering = {
  links?: unknown[];
  verzendDatum?: string;
  wijzigingsDatum?: string;
  status?: string;
  inhoud?: string;
  uploadContext?: unknown;
  assemblyResults?: RawAssembly[];
  additionalObjects?: { GROEP_INLEVERAAR?: string };
};

type RawBoodschap = {
  links?: unknown[];
  verzendDatum?: string;
  onderwerp?: string;
  inhoud?: string;
  bijlages?: RawBijlage[];
  additionalObjects?: {
    verzenderCorrespondent?: { naam?: string };
    verzondenDoorGebruiker?: boolean;
  };
};

type RawInleverDetails = {
  aantalInleveringenInVerwerking?: number;
  inleveringen?: RawInlevering[];
  conversatie?: { boodschappen?: RawBoodschap[] };
};

export type SubmissionView = {
  id?: number;
  verzendDatum?: string;
  status: string;
  statusGewijzigd?: string;
  naam?: string;
  fileUrl?: string;
  fileExtension?: string;
  url?: string;
  ingeleverdDoor?: string;
};

/**
 * Submissions and teacher reactions. Student sessions only: the portal calls
 * this solely when the current context is a student, and a parent session
 * gets HTTP 400. Not used by the parent tools; kept for a future student mode.
 */
export async function fetchAssignmentDetail(
  client: ApiClient,
  toekenningId: number,
): Promise<{
  aantalInleveringenInVerwerking: number;
  inleveringen: SubmissionView[];
  reacties: Array<{
    verzendDatum?: string;
    van?: string;
    doorJou?: boolean;
    onderwerp?: string;
    inhoud?: string;
    bijlagen?: AttachmentView[];
  }>;
}> {
  const { body } = await client.get<RawInleverDetails>(
    `/studiewijzeritemdagtoekenningen/inleverdetails/${toekenningId}`,
  );
  return {
    aantalInleveringenInVerwerking: body.aantalInleveringenInVerwerking ?? 0,
    inleveringen: (body.inleveringen ?? []).map((inlevering) => {
      const file = mapAttachment({
        assemblyResults: inlevering.assemblyResults,
      });
      const isLink = !file && !inlevering.uploadContext && inlevering.inhoud;
      return compact({
        id: linkId(inlevering),
        verzendDatum: inlevering.verzendDatum,
        status: inlevering.status ?? "TE_BEOORDELEN",
        statusGewijzigd: inlevering.wijzigingsDatum,
        naam: file?.fileName ?? (isLink ? inlevering.inhoud : undefined),
        fileUrl: file?.fileUrl,
        fileExtension: file?.fileExtension,
        url: isLink ? inlevering.inhoud : undefined,
        ingeleverdDoor: inlevering.additionalObjects?.GROEP_INLEVERAAR,
      });
    }),
    reacties: (body.conversatie?.boodschappen ?? []).map((boodschap) =>
      compact({
        verzendDatum: boodschap.verzendDatum,
        van: boodschap.additionalObjects?.verzenderCorrespondent?.naam,
        doorJou: boodschap.additionalObjects?.verzondenDoorGebruiker,
        onderwerp: boodschap.onderwerp,
        inhoud: htmlToPlain(boodschap.inhoud) || undefined,
        bijlagen: (boodschap.bijlages ?? [])
          .map(mapAttachment)
          .filter((value): value is AttachmentView => Boolean(value)),
      }),
    ),
  };
}
