import type { JsonSchema, Model, ModelVersion, PriceTier, Pricing, Route } from "@modelvend/admin-api/models";

/** Gross margin of a sale: (price - cost) / price; null when either is unknown or the price is zero. */
export function margin(price: number | null | undefined, cost: number | null | undefined): number | null {
  if (price === null || price === undefined || cost === null || cost === undefined || price <= 0) return null;
  return (price - cost) / price;
}

/** Tone for a margin: under the minimum needs a look, below zero loses money on every call. */
export function marginTone(share: number | null, minMargin: number): "good" | "warning" | "critical" | "neutral" {
  if (share === null) return "neutral";
  if (share < 0) return "critical";
  if (share < minMargin) return "warning";
  return "good";
}

/** A decimal string from the API as a number for arithmetic; null stays null. */
export const decimalValue = (value: string | null | undefined) => (value === null || value === undefined ? null : Number(value));

/** The tier billed by default. */
export function defaultTier<T extends Pick<PriceTier, "id">>(pricing: { defaultTier: string; tiers: T[] }): T | undefined {
  return pricing.tiers.find((tier) => tier.id === pricing.defaultTier) ?? pricing.tiers[0];
}

/** What customers pay per unit at a list price once the launch promo is taken off: price x (1 - promo). */
export function soldPrice(pricing: Pick<Pricing, "promo">, price: string | number): number {
  return Number(price) * (1 - (pricing.promo ?? 0));
}

/** Margin of a tier sold at its promo price against a cost per unit; null when either is unknown. */
export function tierMargin(pricing: Pick<Pricing, "promo">, tier: Pick<PriceTier, "price"> | undefined, cost: string | null | undefined): number | null {
  return tier ? margin(soldPrice(pricing, tier.price), decimalValue(cost)) : null;
}

/** A route's margin at the version's default tier, promo included; null without a cost for that tier. */
export function routeMargin(pricing: Pricing, route: Pick<Route, "tierCosts">): number | null {
  const tier = defaultTier(pricing);
  return tier ? tierMargin(pricing, tier, route.tierCosts[tier.id]) : null;
}

/** Only drafts may still change their schema and price. */
export const isEditable = (version: Pick<ModelVersion, "status">) => version.status === "draft";

/** Live and deprecated versions answer customers, so opening a route on one is a release decision. */
export const answersCustomers = (version: Pick<ModelVersion, "status">) => version.status === "live" || version.status === "deprecated";

/** How a price or cost may be written, as the API takes it: digits with a dot, no exponent. */
const DECIMAL = /^[0-9]+(\.[0-9]+)?$/;

export const isDecimal = (text: string) => DECIMAL.test(text);

/**
 * What stands in the way of stopping a route, when it is the last active one of a version that answers customers:
 * 422 `no_route` for pausing or removing it. A deprecated version with a sunset date may still drain it. Null when
 * the route is free to stop.
 */
export function lastRouteRule(version: Pick<ModelVersion, "status" | "sunsetAt" | "routes">, route: Pick<Route, "id" | "status">): { message: string; mayDrain: boolean } | null {
  if (!answersCustomers(version) || route.status !== "active") return null;
  if (version.routes.some((r) => r.id !== route.id && r.status === "active")) return null;
  const mayDrain = version.status === "deprecated" && version.sunsetAt !== null;
  return {
    mayDrain,
    message: mayDrain
      ? "This is the last active route of a deprecated version: it may drain, but not be paused or removed. Pause the model to stop it at once."
      : `This is the last active route of a ${version.status} version. Add another route first, or pause the model to stop it.`,
  };
}

/** `google/veo-3.1@v2` as its model and version; the version is empty when it isn't pinned. */
export function parsePinned(model: string): { modelId: string; version: string } {
  const at = model.lastIndexOf("@");
  return at === -1 ? { modelId: model, version: "" } : { modelId: model.slice(0, at), version: model.slice(at + 1) };
}

/** Where a model's page lives in the panel. */
export const modelHref = (id: string, version?: string) => `/models/${id}${version ? `?version=${encodeURIComponent(version)}` : ""}`;

/** The version a model's pages show unless the URL picks one: the default, else the newest. */
export function pickVersion(model: Pick<Model, "defaultVersion" | "versionList">, wanted?: string): ModelVersion | undefined {
  return (
    model.versionList.find((v) => v.id === wanted) ??
    model.versionList.find((v) => v.id === model.defaultVersion) ??
    model.versionList[0]
  );
}

/** A free ID for the next version: after v3 comes v4; date-style or odd IDs get a numbered one. */
export function nextVersionId(ids: readonly string[]): string {
  const numbers = ids.map((id) => /^v(\d+)$/.exec(id)?.[1]).filter(Boolean).map(Number);
  let next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  while (ids.includes(`v${next}`)) next++;
  return `v${next}`;
}

/** Lowercase, dash-separated and URL-safe: "FLUX.2 Pro" → "flux.2-pro". */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

export const ID_PART = /^[a-z0-9][a-z0-9.-]*$/;

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
  /** Default, allowed values and bounds, in a few words. */
  constraints: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A readable type for a property schema; anything malformed reads "any" rather than throwing. */
function typeOf(spec: unknown, depth = 0): string {
  if (!isRecord(spec) || depth > 8) return spec === false ? "never" : "any";
  if (Array.isArray(spec.type)) return spec.type.map(String).join(" | ");
  if (typeof spec.type === "string") {
    if (spec.type === "array" && isRecord(spec.items)) return `${typeOf(spec.items, depth + 1)}[]`;
    return spec.type;
  }
  if (Array.isArray(spec.enum)) return "enum";
  const options = Array.isArray(spec.anyOf) ? spec.anyOf : Array.isArray(spec.oneOf) ? spec.oneOf : null;
  if (options) return options.map((option) => typeOf(option, depth + 1)).join(" | ");
  return spec.properties ? "object" : "any";
}

/** The top-level properties and required names, skipping whatever isn't shaped like JSON Schema. */
function partsOf(schema: unknown): { properties: [string, Record<string, unknown>][]; required: Set<string> } {
  const root = isRecord(schema) ? schema : {};
  const properties = isRecord(root.properties) ? root.properties : {};
  const required = Array.isArray(root.required) ? root.required.filter((name): name is string => typeof name === "string") : [];
  return {
    properties: Object.entries(properties).map(([name, spec]) => [name, isRecord(spec) ? spec : {}]),
    required: new Set(required),
  };
}

/** A value as a schema table shows it; anything JSON can't write falls back to its text. */
const show = (value: unknown) => JSON.stringify(value) ?? String(value);

/** The top-level properties of an object schema, for a readable table. A malformed schema shows what can be read. */
export function schemaFields(schema: JsonSchema): SchemaField[] {
  const { properties, required } = partsOf(schema);
  return properties.map(([name, spec]) => {
    const constraints: string[] = [];
    if (spec.default !== undefined) constraints.push(`default ${show(spec.default)}`);
    if (Array.isArray(spec.enum)) constraints.push(spec.enum.map(show).join(", "));
    if (typeof spec.minimum === "number") constraints.push(`≥ ${spec.minimum}`);
    if (typeof spec.maximum === "number") constraints.push(`≤ ${spec.maximum}`);
    if (typeof spec.maxLength === "number") constraints.push(`up to ${spec.maxLength} chars`);
    if (typeof spec.maxItems === "number") constraints.push(`up to ${spec.maxItems} items`);
    if (typeof spec.format === "string") constraints.push(spec.format);
    return {
      name,
      type: typeOf(spec),
      required: required.has(name),
      description: typeof spec.description === "string" ? spec.description : null,
      constraints,
    };
  });
}

/** A task's input built from the schema: required fields with their default, example or a placeholder. */
export function exampleInput(schema: JsonSchema): Record<string, unknown> {
  const { properties, required } = partsOf(schema);
  const body: Record<string, unknown> = {};
  for (const [name, spec] of properties) {
    const example = Array.isArray(spec.examples) ? spec.examples[0] : undefined;
    if (example !== undefined) body[name] = example;
    else if (spec.default !== undefined) body[name] = spec.default;
    else if (required.has(name)) {
      if (Array.isArray(spec.enum) && spec.enum.length > 0) body[name] = spec.enum[0];
      else if (spec.type === "string") body[name] = spec.format === "uri" ? "https://example.com/input.jpg" : "…";
      else if (spec.type === "integer" || spec.type === "number") body[name] = typeof spec.minimum === "number" ? spec.minimum : 1;
      else if (spec.type === "boolean") body[name] = false;
      else if (spec.type === "array") body[name] = [];
    }
  }
  return body;
}

/** Where a schema breaks the shape the catalog needs: a dotted path inside it ("" for the top level) and why. */
export interface SchemaProblem {
  path: string;
  message: string;
}

const JSON_TYPES = ["object", "array", "string", "number", "integer", "boolean", "null"];
const TEXT_KEYWORDS = ["$schema", "$id", "$comment", "title", "description", "format", "pattern"];
const NUMBER_KEYWORDS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"];
const COUNT_KEYWORDS = ["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"];
const MAX_DEPTH = 10;

const at = (path: string, key: string) => (path ? `${path}.${key}` : key);

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

function checkKeywords(spec: Record<string, unknown>, path: string): SchemaProblem | null {
  if (spec.type !== undefined) {
    const types = Array.isArray(spec.type) ? spec.type : [spec.type];
    if (types.length === 0 || types.some((type) => typeof type !== "string" || !JSON_TYPES.includes(type))) {
      return { path: at(path, "type"), message: `Use one of ${JSON_TYPES.join(", ")}, or a list of them.` };
    }
  }
  for (const key of TEXT_KEYWORDS) {
    if (spec[key] !== undefined && typeof spec[key] !== "string") return { path: at(path, key), message: "Must be text." };
  }
  if (typeof spec.pattern === "string") {
    try {
      new RegExp(spec.pattern, "u");
    } catch {
      return { path: at(path, "pattern"), message: "Isn't a valid regular expression." };
    }
  }
  for (const key of NUMBER_KEYWORDS) {
    const value = spec[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) return { path: at(path, key), message: "Must be a number." };
  }
  for (const key of COUNT_KEYWORDS) {
    const value = spec[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
      return { path: at(path, key), message: "Must be a whole number of 0 or more." };
    }
  }
  if (spec.enum !== undefined && (!Array.isArray(spec.enum) || spec.enum.length === 0)) {
    return { path: at(path, "enum"), message: "Must be a list of at least one value." };
  }
  if (spec.examples !== undefined && !Array.isArray(spec.examples)) {
    return { path: at(path, "examples"), message: "Must be a list of example values." };
  }
  if (spec.required !== undefined) {
    const required = spec.required;
    if (!Array.isArray(required) || required.some((name) => typeof name !== "string")) {
      return { path: at(path, "required"), message: "Must be a list of property names." };
    }
    if (new Set(required).size !== required.length) return { path: at(path, "required"), message: "Name each required property once." };
    const properties = isRecord(spec.properties) ? spec.properties : {};
    const missing = (required as string[]).find((name) => !Object.prototype.hasOwnProperty.call(properties, name));
    if (missing !== undefined) return { path: at(path, "required"), message: `"${missing}" is required but isn't in properties.` };
  }
  return null;
}

function checkSubschema(spec: unknown, path: string, depth: number): SchemaProblem | null {
  if (!isRecord(spec)) return { path, message: `Must be a schema object, not ${describeValue(spec)}.` };
  if (depth > MAX_DEPTH) return { path, message: `Nest schemas at most ${MAX_DEPTH} levels deep.` };
  if (spec.properties !== undefined && !isRecord(spec.properties)) {
    return { path: at(path, "properties"), message: "Must be an object of property schemas." };
  }
  const own = checkKeywords(spec, path);
  if (own) return own;
  const children: [unknown, string][] = [];
  for (const [name, property] of Object.entries(isRecord(spec.properties) ? spec.properties : {})) {
    children.push([property, at(at(path, "properties"), name)]);
  }
  if (spec.additionalProperties !== undefined && typeof spec.additionalProperties !== "boolean") {
    children.push([spec.additionalProperties, at(path, "additionalProperties")]);
  }
  if (spec.items !== undefined) children.push([spec.items, at(path, "items")]);
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const options = spec[key];
    if (options === undefined) continue;
    if (!Array.isArray(options) || options.length === 0) return { path: at(path, key), message: "Must be a list of at least one schema." };
    options.forEach((option, index) => children.push([option, at(at(path, key), String(index))]));
  }
  for (const [child, childPath] of children) {
    const problem = checkSubschema(child, childPath, depth + 1);
    if (problem) return problem;
  }
  return null;
}

/**
 * The first place a version's input or output schema breaks the shape the catalog relies on, or null when it's
 * fine: an object at the top with `"type": "object"`, `properties` an object of schema objects, `required` a list
 * of names it defines, and keywords such as `enum`, `items`, `minimum` or `pattern` of the right kind.
 */
export function schemaProblem(schema: unknown): SchemaProblem | null {
  if (!isRecord(schema)) return { path: "", message: "A schema is a JSON object." };
  if (schema.type !== "object") {
    return { path: "type", message: 'The top level must be "type": "object", since inputs and outputs are JSON objects.' };
  }
  return checkSubschema(schema, "", 0);
}

/** "properties.duration.enum: Must be a list of at least one value." */
export const describeSchemaProblem = (problem: SchemaProblem) =>
  problem.path ? `${problem.path}: ${problem.message}` : problem.message;

/** Parses a JSON object typed into an editor; the error says where it broke. */
export function parseJsonObject(text: string, what = "This"): { value: Record<string, unknown> } | { error: string } {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) return { error: `${what} must be a JSON object.` };
    return { value };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That isn't valid JSON." };
  }
}

/** Parses JSON typed into a schema editor. */
export function parseSchema(text: string): { schema: JsonSchema } | { error: string } {
  const parsed = parseJsonObject(text);
  if ("value" in parsed) return { schema: parsed.value };
  return { error: parsed.error === "This must be a JSON object." ? "A schema is a JSON object." : parsed.error };
}
