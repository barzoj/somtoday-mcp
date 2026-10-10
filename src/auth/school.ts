import { SCHOOLS_URL } from "../constants.js";

export type School = {
  uuid: string;
  naam: string;
  plaats?: string;
};

type OrganisatiePayload = Array<{
  instellingen?: Array<{
    uuid?: string;
    naam?: string;
    plaats?: string;
  }>;
}>;

export function matchSchools(schools: School[], query: string): School[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return schools.filter((school) => school.naam.toLowerCase().includes(needle));
}

export function parseSchools(payload: unknown): School[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const schools: School[] = [];
  for (const group of payload as OrganisatiePayload) {
    for (const item of group.instellingen ?? []) {
      if (item.uuid && item.naam) {
        schools.push({
          uuid: item.uuid,
          naam: item.naam,
          plaats: item.plaats,
        });
      }
    }
  }
  return schools;
}

export async function fetchSchools(
  fetchFn: typeof fetch = fetch,
): Promise<School[]> {
  const response = await fetchFn(SCHOOLS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`School list failed: HTTP ${response.status}`);
  }
  return parseSchools(await response.json());
}

export function schoolLabel(school: School): string {
  return school.plaats ? `${school.naam} (${school.plaats})` : school.naam;
}
