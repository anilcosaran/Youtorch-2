import type { NextRequest } from "next/server";
import { DEFAULT_OPERATOR_ID } from "./seed/operators";
import type { OperatorRecord, Store } from "./types";

/*
 * The mock's session lives in two cookies: one that says the browser signed
 * out, and one naming the operator who signed in. Without either, the mock is
 * signed in as the seeded admin.
 */

export const SIGNED_OUT_COOKIE = "mv_mock_signed_out";
export const OPERATOR_COOKIE = "mv_mock_operator";

/** The signed-in operator, or null when signed out or their account is disabled. */
export function currentOperator(store: Store, request: NextRequest): OperatorRecord | null {
  if (request.cookies.get(SIGNED_OUT_COOKIE)?.value === "1") return null;
  const id = request.cookies.get(OPERATOR_COOKIE)?.value || DEFAULT_OPERATOR_ID;
  const operator = store.operators.find((o) => o.id === id);
  return operator && !operator.disabled ? operator : null;
}

/** A `Set-Cookie` value; without `value` it clears the cookie. */
export function cookie(name: string, value?: string): string {
  const base = `${name}=${value ?? ""}; Path=/; HttpOnly; SameSite=Lax`;
  return value === undefined ? `${base}; Max-Age=0` : base;
}
