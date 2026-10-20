import { SCHOOLS_MIRROR_URL, SCHOOLS_URL } from "../constants.js";
import { userAgent } from "../packageVersion.js";
import { formatError } from "../errors.js";

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

export const SCHOOL_LIST_SOURCES = [SCHOOLS_URL, SCHOOLS_MIRROR_URL] as const;

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
  const errors: string[] = [];
  for (const url of SCHOOL_LIST_SOURCES) {
    try {
      const response = await fetchFn(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent(),
        },
        // The official host now 301s into a Cloudflare login challenge.
        redirect: url === SCHOOLS_URL ? "manual" : "follow",
      });
      if (response.status >= 300 && response.status < 400) {
        errors.push(`${url} HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) {
        errors.push(`${url} HTTP ${response.status}`);
        continue;
      }
      const text = await response.text();
      if (text.trimStart().startsWith("<")) {
        errors.push(`${url} returned HTML`);
        continue;
      }
      const schools = parseSchools(JSON.parse(text) as unknown);
      if (schools.length === 0) {
        errors.push(`${url} had no schools`);
        continue;
      }
      return schools;
    } catch (error) {
      errors.push(`${url} ${formatError(error)}`);
    }
  }
  throw new Error(`School list failed. ${errors.join("; ")}`);
}

export function schoolLabel(school: School): string {
  return school.plaats ? `${school.naam} (${school.plaats})` : school.naam;
}
