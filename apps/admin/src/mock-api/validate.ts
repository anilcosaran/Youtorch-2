import type { JsonSchema } from "@modelvend/admin-api/models";
import { describeSchemaProblem, schemaProblem } from "@/lib/catalog";
import { MockError, invalid } from "./http";
import { clone } from "./util";

/** A parsed JSON request body. */
export type Body = Record<string, unknown>;

/** Lowercase letters, digits, dots and dashes, starting with a letter or digit. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

/** Whether the body sends the field, null included. */
export const has = (body: Body, field: string) => body[field] !== undefined;

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface TextOptions {
  max?: number;
  /** Message when it is missing or empty. */
  required?: string;
}

/** A trimmed string; undefined when absent and not required. */
export function text(body: Body, field: string, options: TextOptions & { required: string }): string;
export function text(body: Body, field: string, options?: TextOptions): string | undefined;
export function text(body: Body, field: string, { max = 200, required }: TextOptions = {}): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    if (required) invalid(field, required);
    return undefined;
  }
  if (typeof value !== "string") return invalid(field, "Must be text.");
  const trimmed = value.trim();
  if (required && trimmed === "") invalid(field, required);
  if (trimmed.length > max) invalid(field, `Use at most ${max} characters.`);
  return trimmed;
}

/** A required reason for a pause, suspension, revocation or refund. */
export const reason = (body: Body) => text(body, "reason", { max: 500, required: "Give a reason." });

/** One of `values`; undefined when absent and not required. */
export function oneOf<T extends string>(body: Body, field: string, values: readonly T[], required: true): T;
export function oneOf<T extends string>(body: Body, field: string, values: readonly T[], required?: boolean): T | undefined;
export function oneOf<T extends string>(body: Body, field: string, values: readonly T[], required = false): T | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    if (required) invalid(field, `Choose one of ${values.join(", ")}.`);
    return undefined;
  }
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    return invalid(field, `Choose one of ${values.join(", ")}.`);
  }
  return value as T;
}

export function bool(body: Body, field: string): boolean | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") return invalid(field, "Must be true or false.");
  return value;
}

interface NumberOptions {
  min?: number;
  max?: number;
  /** Must be strictly greater than this. */
  above?: number;
  integer?: boolean;
}

/** Checks a number against the options; 422 on `field` otherwise. */
export function checkNumber(value: unknown, field: string, { min, max, above, integer }: NumberOptions = {}): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return invalid(field, "Must be a number.");
  if (integer && !Number.isInteger(value)) invalid(field, "Must be a whole number.");
  if (above !== undefined && value <= above) invalid(field, `Must be more than ${above}.`);
  if (min !== undefined && value < min) invalid(field, `Must be at least ${min}.`);
  if (max !== undefined && value > max) invalid(field, `Must be at most ${max}.`);
  return value;
}

/** A number; undefined when absent. */
export function number(body: Body, field: string, options: NumberOptions = {}): number | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  return checkNumber(value, field, options);
}

/** A number or null; undefined when absent. */
export function nullableNumber(body: Body, field: string, options: NumberOptions = {}): number | null | undefined {
  const value = body[field];
  if (value === undefined || value === null) return value as null | undefined;
  return checkNumber(value, field, options);
}

const DECIMAL = /^[0-9]+(\.[0-9]+)?$/;

/** A price per unit as the API writes it, such as "0.084"; 422 on `field` otherwise. */
export function checkDecimal(value: unknown, field: string): string {
  if (typeof value !== "string" || !DECIMAL.test(value)) return invalid(field, 'Must be a decimal string, such as "0.084".');
  return value;
}

/** A JSON Schema in the shape the catalog relies on; 422 naming where it breaks otherwise. */
export function readSchema(body: Body, field: string): JsonSchema {
  const value = body[field];
  if (!isObject(value)) return invalid(field, "Must be a JSON Schema object.");
  const problem = schemaProblem(value);
  if (problem) invalid(problem.path ? `${field}.${problem.path}` : field, describeSchemaProblem(problem));
  return clone(value);
}

/** A list of strings, trimmed, each once; undefined when absent. */
export function stringList(body: Body, field: string, max = 50): string[] | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return invalid(field, "Must be a list of text.");
  }
  const items = [...new Set((value as string[]).map((item) => item.trim()).filter(Boolean))];
  if (items.length > max) invalid(field, `Use at most ${max}.`);
  return items;
}

/** A lowercase ID such as a slug or version ID. */
export function idField(body: Body, field: string, what: string, pattern = ID_PATTERN): string {
  const value = text(body, field, { max: 64, required: `Enter a ${what}.` });
  if (!pattern.test(value)) {
    invalid(field, `Use lowercase letters, digits${pattern === ID_PATTERN ? ", dots" : ""} and dashes, starting with a letter or digit.`);
  }
  return value;
}

/** Runs checks on a nested object, so field errors read `pricing.unit` instead of `unit`. */
export function within<T>(prefix: string, check: () => T): T {
  try {
    return check();
  } catch (error) {
    if (!(error instanceof MockError) || !error.fields) throw error;
    const fields = Object.fromEntries(Object.entries(error.fields).map(([field, message]) => [`${prefix}.${field}`, message]));
    throw new MockError(error.status, error.code, error.message, fields);
  }
}

/** A nested object; 422 when it is anything else. */
export function nested(body: Body, field: string): Body {
  const value = body[field];
  return isObject(value) ? value : invalid(field, "Must be an object.");
}

/** A timestamp in the future. */
export function futureDate(body: Body, field: string, message: string): string {
  const value = body[field];
  const ms = typeof value === "string" ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) return invalid(field, "Enter a date.");
  if (ms <= Date.now()) invalid(field, message);
  return new Date(ms).toISOString();
}
