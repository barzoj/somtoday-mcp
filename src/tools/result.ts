import { LOGIN_INSTRUCTION } from "../constants.js";
import { LoginRequiredError } from "../errors.js";
import { MultipleChildrenError, describeChildren } from "../api/account.js";
import { redact } from "../log.js";
import { ApiNotAvailableError } from "../api/client.js";

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

export async function withToolErrors(
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof LoginRequiredError) {
      return errorResult(LOGIN_INSTRUCTION);
    }
    if (error instanceof ApiNotAvailableError) {
      return jsonResult(notAvailable(error));
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

export type NotAvailable = {
  available: false;
  status?: number;
  reason: string;
};

export function notAvailable(error: ApiNotAvailableError): NotAvailable {
  return {
    available: false,
    status: error.status,
    reason:
      error.status === 403
        ? "Somtoday answered 403: not available for this account (switched off by the school, no permission, or nothing published yet)"
        : "Somtoday answered 404: not found",
  };
}

/** Run one part of a tool; a "not available" answer becomes a marker instead of failing the whole tool. */
export async function section<T>(
  run: () => Promise<T>,
): Promise<T | NotAvailable> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiNotAvailableError) {
      return notAvailable(error);
    }
    throw error;
  }
}
