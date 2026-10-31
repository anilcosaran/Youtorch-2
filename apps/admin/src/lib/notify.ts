import { toast } from "sonner";
import { ApiError, errorMessage, fieldErrors } from "@modelvend/admin-api/client";

/** A field name the server sent, readable: "steps.0.input" → "Steps 0 input", "limits.requestsPerMinute" → "Requests per minute". */
export function fieldLabel(field: string, labels: Record<string, string> = {}): string {
  if (labels[field]) return labels[field];
  const parts = field.split(".").filter((part) => part !== "limits" && part !== "");
  const words = parts.join(" ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : field;
}

/**
 * A failed submission split for a form: the field errors it shows next to its fields (`shown`, by the server's
 * field names), and one message for the rest. A field error the form has no place for is named in the message,
 * so none is ever dropped; without field errors the message is the error's own.
 */
export function formErrors(
  error: unknown,
  shown: readonly string[],
  labels: Record<string, string> = {},
): { fields: Record<string, string>; message: string | null } {
  const all = fieldErrors(error);
  const fields: Record<string, string> = {};
  const rest: string[] = [];
  for (const [field, message] of Object.entries(all)) {
    if (shown.includes(field)) fields[field] = message;
    else rest.push(`${fieldLabel(field, labels)}: ${message}`);
  }
  if (Object.keys(all).length === 0) return { fields, message: errorMessage(error) };
  return { fields, message: rest.length > 0 ? rest.join(" ") : null };
}

/** What a refused publish says when a tier or run is under the minimum margin; null for any other failure. */
export function lowMarginMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== "low_margin") return null;
  return error.fields.reason ?? error.message;
}

/** A 409 `stale`: the model changed since the revision the change was based on. */
export const isStale = (error: unknown) => error instanceof ApiError && error.code === "stale";

/** An error's message, naming the field when the server pinned it on one: "Priority: Must be at most 100." */
function describe(error: unknown): string {
  const fields = Object.entries(fieldErrors(error));
  const message = errorMessage(error);
  if (fields.length === 1 && fields[0][1] === message) return `${fieldLabel(fields[0][0])}: ${message}`;
  return message;
}

/** Shows a failed request as a toast. A 401 is skipped: the browser is already on its way to sign in. */
export function toastError(error: unknown, title?: string) {
  if (error instanceof ApiError && error.status === 401) return;
  const message = describe(error);
  if (title) toast.error(title, { description: message });
  else toast.error(message);
}
