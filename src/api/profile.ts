import { htmlToPlain } from "../html.js";
import type { ApiClient } from "./client.js";
import { simplify } from "./simplify.js";
import { compact } from "./studiewijzer.js";

type RawLeerling = {
  UUID?: string;
  roepnaam?: string;
  achternaam?: string;
  leerlingnummer?: number;
  geboortedatum?: string;
  email?: string;
  mobielNummer?: string;
  additionalObjects?: { stamgroep?: string };
};

export async function fetchLeerling(client: ApiClient, leerlingId: number) {
  const query = new URLSearchParams();
  query.append("additional", "stamgroep");
  const { body } = await client.get<RawLeerling>(
    `/leerlingen/${leerlingId}`,
    query,
  );
  return compact({
    roepnaam: body.roepnaam,
    achternaam: body.achternaam,
    leerlingnummer: body.leerlingnummer,
    geboortedatum: body.geboortedatum,
    email: body.email,
    mobiel: body.mobielNummer,
    stamgroep: body.additionalObjects?.stamgroep,
  });
}

type RawSchoolgegevens = {
  leerlingId?: number;
  instellingsnaam?: string;
  huidigeVestiging?: { naam?: string; afkorting?: string };
  straat?: string;
  postcode?: string;
  plaats?: string;
  telefoonnummer?: string;
  email?: string;
  leerjaar?: number;
  loopbaan?: string;
  opleidingNaam?: string;
  stamgroepnaam?: string;
  mentoren?: string[];
};

export type SchoolgegevensView = ReturnType<typeof mapSchoolgegevens>;

function mapSchoolgegevens(item: RawSchoolgegevens) {
  return compact({
    leerlingId: item.leerlingId,
    school: item.instellingsnaam,
    vestiging: item.huidigeVestiging?.naam,
    adres:
      [item.straat, [item.postcode, item.plaats].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ") || undefined,
    telefoon: item.telefoonnummer,
    email: item.email,
    leerjaar: item.leerjaar,
    opleiding: item.opleidingNaam,
    loopbaan: item.loopbaan,
    stamgroep: item.stamgroepnaam,
    mentoren: item.mentoren,
  });
}

export async function fetchSchoolgegevens(client: ApiClient) {
  const { items } = await client.getAll<RawSchoolgegevens>(
    "/leerlingen/verzorger/schoolgegevens",
  );
  return items.map(mapSchoolgegevens);
}

type RawPagina = {
  id?: number;
  titel?: string;
  introductie?: string;
  icon?: string;
  publiceerdatum?: string;
  wijzigingsdatum?: string;
};

export async function fetchSchoolPages(client: ApiClient) {
  const { body } = await client.get<{ paginas?: RawPagina[] }>(
    "/schoolinformatie/gepubliceerd/v2/paginas",
    undefined,
    { accept: "json" },
  );
  return (body.paginas ?? []).map((pagina) =>
    compact({
      paginaId: pagina.id,
      titel: pagina.titel,
      introductie: htmlToPlain(pagina.introductie) || undefined,
      gewijzigd: pagina.wijzigingsdatum ?? pagina.publiceerdatum,
    }),
  );
}

/** One school-information page with its topics and document folders (generic shape). */
export async function fetchSchoolPage(client: ApiClient, paginaId: number) {
  const { body } = await client.get<unknown>(
    `/schoolinformatie/gepubliceerd/v2/paginas/${paginaId}`,
    undefined,
    { accept: "json" },
  );
  return simplify(body) ?? {};
}

type RawMedewerker = {
  links?: unknown[];
  naam?: string;
  achternaam?: string;
  voorletters?: string;
  roepnaam?: string;
  initialen?: string;
  afkorting?: string;
  additionalObjects?: { vakkenDocentVoorLeerling?: unknown };
};

/** Staff the account can message, with the subjects they teach the child. */
export async function fetchTeachers(client: ApiClient) {
  const query = new URLSearchParams();
  query.append("additional", "vakkenDocentVoorLeerling");
  const { items } = await client.getAll<RawMedewerker>(
    "/medewerkers/ontvangers",
    query,
  );
  return items.map((item) => {
    const simple = (simplify(item) ?? {}) as Record<string, unknown>;
    const vakken = simple.vakkenDocentVoorLeerling;
    delete simple.vakkenDocentVoorLeerling;
    return compact({
      ...simple,
      vakken: Array.isArray(vakken)
        ? vakken.map((vak) =>
            typeof vak === "object" && vak
              ? ((vak as { naam?: string }).naam ?? JSON.stringify(vak))
              : String(vak),
          )
        : undefined,
    });
  });
}
