import type { Page } from "@/lib/api/client";

/** An API error: the status plus the `{ error: { code, message, fields? } }` body. */
export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "MockError";
  }
}

export function fail(status: number, code: string, message: string, fields?: Record<string, string>): never {
  throw new MockError(status, code, message, fields);
}

export const badRequest = (message: string, code = "bad_request"): never => fail(400, code, message);

export const notFound = (what: string): never => fail(404, "not_found", `No ${what} with this ID.`);

export const conflict = (message: string, fields?: Record<string, string>): never => fail(409, "conflict", message, fields);

/** 422 with one field error. */
export const invalid = (field: string, message: string): never =>
  fail(422, "validation_failed", message, { [field]: message });

/** 422 for a change the resource's current state doesn't allow. */
export const invalidState = (message: string, code = "invalid_state"): never => fail(422, code, message);

export function errorResponse(error: MockError): Response {
  const body = { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } };
  return Response.json(body, { status: error.status });
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const encodeCursor = (offset: number) => btoa(`o:${offset}`).replace(/=+$/, "");

function decodeCursor(cursor: string): number {
  try {
    const match = /^o:(\d+)$/.exec(atob(cursor));
    if (match) return Number(match[1]);
  } catch {
    // Not base64.
  }
  return badRequest("That cursor isn't valid. Start from the first page.", "invalid_cursor");
}

/** One page of `items` from `?limit=` (default 50, max 200) and `?cursor=`. */
export function paginate<T>(items: readonly T[], query: URLSearchParams): Page<T> {
  const rawLimit = query.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null && rawLimit !== "") {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1) badRequest("`limit` must be a whole number from 1 to 200.");
    limit = Math.min(limit, MAX_LIMIT);
  }
  const rawCursor = query.get("cursor");
  const offset = rawCursor ? decodeCursor(rawCursor) : 0;
  const slice = items.slice(offset, offset + limit);
  const end = offset + slice.length;
  return { items: slice, nextCursor: end < items.length ? encodeCursor(end) : null };
}
