import type { ApiClient } from "./client.js";
import type { AccountMe, EloRestricties } from "./types.js";

export type ChildAccess = {
  leerlingId: number;
  huiswerkBekijkenAan: boolean;
  roosterBekijkenAan: boolean;
  cijfersBekijkenAan: boolean;
};

export async function loadChildren(client: ApiClient): Promise<ChildAccess[]> {
  const query = new URLSearchParams();
  query.append("additional", "restricties");
  const { body } = await client.get<AccountMe>("/account/me", query);
  const items = body.additionalObjects?.restricties?.items ?? [];
  return items
    .filter((item): item is EloRestricties & { leerlingId: number } => {
      return typeof item.leerlingId === "number";
    })
    .map((item) => ({
      leerlingId: item.leerlingId,
      huiswerkBekijkenAan: item.huiswerkBekijkenAan === true,
      roosterBekijkenAan: item.roosterBekijkenAan === true,
      cijfersBekijkenAan: item.cijfersBekijkenAan === true,
    }));
}

export function resolveChild(
  children: ChildAccess[],
  requested?: string,
): ChildAccess {
  if (children.length === 0) {
    throw new Error("No linked leerling ids on this account");
  }
  if (requested) {
    const id = Number(requested);
    const match = children.find((child) => child.leerlingId === id);
    if (!match) {
      throw new Error(`Unknown leerlingId ${requested}`);
    }
    return match;
  }
  if (children.length === 1) {
    return children[0]!;
  }
  throw new MultipleChildrenError(children);
}

export class MultipleChildrenError extends Error {
  constructor(readonly children: ChildAccess[]) {
    super("Multiple linked students; pass leerlingId");
    this.name = "MultipleChildrenError";
  }
}

export function describeChildren(children: ChildAccess[]): unknown {
  return children.map((child) => ({
    leerlingId: child.leerlingId,
    huiswerkBekijkenAan: child.huiswerkBekijkenAan,
    roosterBekijkenAan: child.roosterBekijkenAan,
    cijfersBekijkenAan: child.cijfersBekijkenAan,
  }));
}
