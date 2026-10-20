// Redacted shapes from the HAR map / portal source. Neutral fixture values only.
export const LEERLING = 4242;

export const lesgroep = {
  $type: "lesgroep.RLesgroep",
  links: [{ id: 501, rel: "self", type: "lesgroep.RLesgroep", href: "x" }],
  UUID: "00000000-0000-4000-8000-0000000000a1",
  naam: "2A-wi",
  omschrijving: "Wiskunde 2A",
  vak: {
    UUID: "00000000-0000-4000-8000-0000000000b1",
    afkorting: "wi",
    naam: "Wiskunde",
  },
};

export function toekenning(
  type: "Afspraak" | "Dag" | "Week",
  id: number,
  extra: Record<string, unknown> = {},
  item: Record<string, unknown> = {},
) {
  return {
    $type: `studiewijzer.RSWI${type}Toekenning`,
    links: [
      {
        id,
        rel: "self",
        type: `studiewijzer.RSWI${type}Toekenning`,
        href: "x",
      },
    ],
    permissions: [],
    lesgroep,
    sortering: 1,
    additionalObjects: {
      lesgroep,
      studiewijzerId: 900,
      leerlingProjectgroep: null,
      leerlingen: { $type: "LinkableWrapper", items: [] },
      swigemaaktVinkjes: {
        items: [
          {
            leerling: { links: [{ id: LEERLING, rel: "self" }] },
            gemaakt: true,
          },
        ],
      },
      leerlingenMetInleveringStatus: {
        $type: "wrappers.NonLinkableWrapper",
        items: [],
      },
    },
    studiewijzerItem: {
      links: [{ id: id + 10_000, rel: "self" }],
      huiswerkType: "HUISWERK",
      onderwerp: `Item ${id}`,
      omschrijving: "<p>Lees <b>paragraaf 3.2</b></p>",
      leerdoelen: "<ul><li>Kwadratische vergelijkingen</li></ul>",
      tijdsindicatie: "30 minuten",
      notitie: "Neem je rekenmachine mee",
      notitieZichtbaarVoorLeerling: true,
      lesmateriaal: false,
      projectgroepen: false,
      inleverperiodes: false,
      tonen: true,
      bijlagen: [
        {
          links: [{ id: 7001, rel: "self" }],
          omschrijving: "Werkblad",
          assemblyResults: [
            {
              assemblyFileType: "THUMBNAIL",
              fileName: "thumb.png",
              fileUrl: "https://files.example.test/thumb.png",
            },
            {
              assemblyFileType: "DOCUMENT",
              fileName: "werkblad.pdf",
              fileUrl: "https://files.example.test/werkblad.pdf",
              fileSize: 1234,
              fileExtension: "pdf",
            },
          ],
        },
      ],
      externeMaterialen: [
        { uri: "https://method.example.test/h3", omschrijving: "Methode H3" },
        { omschrijving: "zonder link" },
      ],
      inlevermomenten: [],
      ...item,
    },
    ...extra,
  };
}

export function handIn(
  id: number,
  start: string,
  eind: string,
  status?: string,
) {
  return toekenning(
    "Dag",
    id,
    {
      datumTijd: start,
      additionalObjects: {
        lesgroep,
        studiewijzerId: 901,
        leerlingenMetInleveringStatus: {
          items: status
            ? [
                {
                  leerlingId: LEERLING,
                  status,
                  verzendDatum: "2026-10-18T10:00:00Z",
                },
              ]
            : [],
        },
      },
    },
    {
      huiswerkType: "HUISWERK",
      onderwerp: `Opdracht ${id}`,
      inleverperiodes: true,
      inlevermomenten: [
        {
          links: [{ id: id + 20_000, rel: "self" }],
          startGeldigheid: start,
          eindGeldigheid: eind,
          omschrijving: "Inleveren als PDF",
          inleveringenAantal: status ? 1 : 0,
          inleveringenVerwacht: 1,
        },
      ],
    },
  );
}
