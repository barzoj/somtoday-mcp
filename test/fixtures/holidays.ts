/**
 * Realistic Somtoday holiday payload shape (participatie.RVakantie), as
 * documented for GET /rest/v1/vakanties/leerling/{id}: local midnight with
 * timezone offset, inclusive beginDatum/eindDatum.
 */
export const kerstvakantie2026 = {
  $type: "participatie.RVakantie",
  links: [
    {
      id: 9001,
      rel: "self",
      type: "participatie.RVakantie",
      href: "https://api.example.test/rest/v1/vakanties/9001",
    },
  ],
  additionalObjects: {},
  naam: "Kerstvakantie",
  beginDatum: "2026-12-21T00:00:00.000+01:00",
  eindDatum: "2027-01-03T00:00:00.000+01:00",
};

export const herfstvakantie2026 = {
  $type: "participatie.RVakantie",
  links: [
    {
      id: 9002,
      rel: "self",
      type: "participatie.RVakantie",
      href: "https://api.example.test/rest/v1/vakanties/9002",
    },
  ],
  additionalObjects: {},
  naam: "Herfstvakantie",
  beginDatum: "2026-10-17T00:00:00.000+02:00",
  eindDatum: "2026-10-25T00:00:00.000+02:00",
};
