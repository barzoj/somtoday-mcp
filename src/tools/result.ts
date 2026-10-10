import { LOGIN_INSTRUCTION } from "../constants.js";
import { LoginRequiredError } from "../errors.js";
import { MultipleChildrenError, describeChildren } from "../api/account.js";
import { redact } from "../log.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function jsonResult(value: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function errorResult(text: string): ToolResult {
  return {
    isError: true,
    content: [{ type: "text", text }],
  };
}

export async function withToolErrors(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof LoginRequiredError) {
      return errorResult(LOGIN_INSTRUCTION);
    }
    if (error instanceof MultipleChildrenError) {
      return errorResult(
        JSON.stringify(
          {
            error: "Multiple linked students; pass leerlingId",
            children: describeChildren(error.children),
          },
          null,
          2,
        ),
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(redact(message));
  }
}
