import type { JsonSchema, Model, ModelVersion, PriceTier, Pricing, VersionStatus } from "./api/models";

/** Gross margin of a sale: (price − cost) ÷ price; null when either is unknown or the price is zero. */
export function margin(price: number | null | undefined, cost: number | null | undefined): number | null {
  if (price === null || price === undefined || cost === null || cost === undefined || price <= 0) return null;
  return (price - cost) / price;
}

/** Tone for a margin: under 15% needs a look, below zero loses money on every call. */
export function marginTone(share: number | null): "good" | "warning" | "critical" | "neutral" {
  if (share === null) return "neutral";
  if (share < 0) return "critical";
  if (share < 0.15) return "warning";
  return "good";
}

/** The tier billed by default. */
export function defaultTier(pricing: Pricing): PriceTier | undefined {
  return pricing.tiers.find((tier) => tier.id === pricing.defaultTier) ?? pricing.tiers[0];
}

/** Statuses whose schema and price may still change. */
export const EDITABLE_STATUSES: readonly VersionStatus[] = ["draft", "staging"];

export const isEditable = (version: Pick<ModelVersion, "status">) => EDITABLE_STATUSES.includes(version.status);

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

function typeOf(spec: Record<string, unknown>): string {
  if (Array.isArray(spec.type)) return spec.type.join(" | ");
  if (typeof spec.type === "string") {
    if (spec.type === "array" && spec.items && typeof spec.items === "object") {
      return `${typeOf(spec.items as Record<string, unknown>)}[]`;
    }
    return spec.type;
  }
  if (Array.isArray(spec.enum)) return "enum";
  if (Array.isArray(spec.anyOf) || Array.isArray(spec.oneOf)) {
    const options = (spec.anyOf ?? spec.oneOf) as Record<string, unknown>[];
    return options.map(typeOf).join(" | ");
  }
  return spec.properties ? "object" : "any";
}

/** The top-level properties of an object schema, for a readable table. */
export function schemaFields(schema: JsonSchema): SchemaField[] {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  return Object.entries(properties).map(([name, spec]) => {
    const constraints: string[] = [];
    if (spec.default !== undefined) constraints.push(`default ${JSON.stringify(spec.default)}`);
    if (Array.isArray(spec.enum)) constraints.push(spec.enum.map((v) => JSON.stringify(v)).join(", "));
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

/** A request body built from the schema: required fields with their default, example or a placeholder. */
export function exampleInput(schema: JsonSchema): Record<string, unknown> {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const body: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(properties)) {
    const example = Array.isArray(spec.examples) ? spec.examples[0] : undefined;
    if (example !== undefined) body[name] = example;
    else if (spec.default !== undefined) body[name] = spec.default;
    else if (required.has(name)) {
      if (Array.isArray(spec.enum)) body[name] = spec.enum[0];
      else if (spec.type === "string") body[name] = spec.format === "uri" ? "https://example.com/input.jpg" : "…";
      else if (spec.type === "integer" || spec.type === "number") body[name] = spec.minimum ?? 1;
      else if (spec.type === "boolean") body[name] = false;
      else if (spec.type === "array") body[name] = [];
    }
  }
  return body;
}

/** Parses JSON typed into an editor; the error says where it broke. */
export function parseSchema(text: string): { schema: JsonSchema } | { error: string } {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "A schema is a JSON object." };
    return { schema: value as JsonSchema };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That isn't valid JSON." };
  }
}
