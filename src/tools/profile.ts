import { describeChildren, loadChildren } from "../api/account.js";
import {
  fetchLeerling,
  fetchSchoolPage,
  fetchSchoolPages,
  fetchSchoolgegevens,
  fetchTeachers,
} from "../api/profile.js";
import { fetchPlaatsingen } from "../api/results.js";
import { accountTool } from "./child-tool.js";
import type { ToolContext } from "./context.js";
import { section, type ToolResult } from "./result.js";

export async function childrenTool(ctx: ToolContext): Promise<ToolResult> {
  return accountTool(ctx, async () => {
    const [children, schoolgegevens, school] = await Promise.all([
      loadChildren(ctx.client),
      section(() => fetchSchoolgegevens(ctx.client)),
      ctx.session.schoolLabel(),
    ]);
    const details = await Promise.all(
      children.map(async (child) => {
        const [profiel, plaatsingen] = await Promise.all([
          section(() => fetchLeerling(ctx.client, child.leerlingId)),
          section(() => fetchPlaatsingen(ctx.client, child.leerlingId)),
        ]);
        return {
          leerlingId: child.leerlingId,
          profiel,
          school: Array.isArray(schoolgegevens)
            ? schoolgegevens.find(
                (item) => item.leerlingId === child.leerlingId,
              )
            : schoolgegevens,
          plaatsing: Array.isArray(plaatsingen)
            ? (plaatsingen.find((item) => item.huidig) ?? plaatsingen[0])
            : plaatsingen,
          zichtbareOnderdelen: child.rights,
        };
      }),
    );
    return { school, kinderen: details, rechten: describeChildren(children) };
  });
}

export async function schoolInfoTool(
  ctx: ToolContext,
  args: { paginaId?: number },
): Promise<ToolResult> {
  return accountTool(ctx, async () => {
    if (args.paginaId !== undefined) {
      return { pagina: await fetchSchoolPage(ctx.client, args.paginaId) };
    }
    const [schoolgegevens, paginas] = await Promise.all([
      section(() => fetchSchoolgegevens(ctx.client)),
      section(() => fetchSchoolPages(ctx.client)),
    ]);
    return { schoolgegevens, paginas };
  });
}

export async function teachersTool(ctx: ToolContext): Promise<ToolResult> {
  return accountTool(ctx, async () => ({
    docenten: await section(() => fetchTeachers(ctx.client)),
  }));
}
