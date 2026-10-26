import { describe, expect, it } from "vitest";
import type { JsonSchema, Pricing } from "@modelvend/admin-api/models";
import { describeSchemaProblem, exampleInput, routeMargin, schemaFields, schemaProblem, soldPrice, tierMargin } from "./catalog";

/** Seedance 2.5 v2 as seeded: 1080p by default at $0.206/s, with a 50% launch promo. */
const seedance: Pricing = {
  unit: "second",
  defaultTier: "1080p",
  tiers: [
    { id: "720p", label: "720p", price: 0.14, cost: null },
    { id: "1080p", label: "1080p", price: 0.206, cost: null },
  ],
  input: { unit: "second", price: 0.04 },
  promo: 0.5,
};

describe("margins with the promo", () => {
  it("prices a tier after the promo", () => {
    expect(soldPrice(seedance, 0.206)).toBeCloseTo(0.103);
    expect(soldPrice({ promo: null }, 0.206)).toBeCloseTo(0.206);
  });

  it("shows the byteplus route losing money, not a 37% margin", () => {
    // (0.103 − 0.13) ÷ 0.103
    expect(routeMargin(seedance, { unit: "second", price: 0.13 })).toBeCloseTo(-0.262, 3);
    expect(tierMargin(seedance, seedance.tiers[1], 0.13)).toBeCloseTo(-0.262, 3);
    expect(tierMargin({ promo: null }, seedance.tiers[1], 0.13)).toBeCloseTo(0.369, 3);
  });

  it("has no margin for a cost in another unit", () => {
    expect(routeMargin(seedance, { unit: "minute", price: 7.8 })).toBeNull();
    expect(tierMargin(seedance, undefined, 0.13)).toBeNull();
  });
});

describe("schemaProblem", () => {
  const valid: JsonSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      prompt: { type: "string", minLength: 1, maxLength: 2500, description: "What happens" },
      duration: { type: "integer", enum: [5, 10], default: 5 },
      image_urls: { type: "array", items: { type: "string", format: "uri" }, maxItems: 4 },
      language: { type: "string", pattern: "^[a-z]{2}$" },
      size: { anyOf: [{ type: "string" }, { type: "object", properties: { w: { type: "integer" } }, required: ["w"] }] },
    },
    required: ["prompt"],
    additionalProperties: false,
  };

  it("accepts the shapes the seeded schemas use", () => {
    expect(schemaProblem(valid)).toBeNull();
    expect(schemaProblem({ type: "object" })).toBeNull();
  });

  it("names the first place a schema breaks", () => {
    expect(schemaProblem([])).toEqual({ path: "", message: "A schema is a JSON object." });
    expect(schemaProblem({ properties: {} })?.path).toBe("type");
    expect(schemaProblem({ type: "object", properties: { x: null } })).toEqual({
      path: "properties.x",
      message: "Must be a schema object, not null.",
    });
    expect(schemaProblem({ type: "object", properties: { x: "string" } })?.path).toBe("properties.x");
    expect(schemaProblem({ type: "object", required: ["x"] })?.message).toBe('"x" is required but isn\'t in properties.');
    expect(schemaProblem({ type: "object", properties: { x: { type: "string" } }, required: ["x", "x"] })?.path).toBe("required");
    expect(schemaProblem({ type: "object", properties: { x: { minimum: "1" } } })?.path).toBe("properties.x.minimum");
    expect(schemaProblem({ type: "object", properties: { x: { maxLength: -1 } } })?.path).toBe("properties.x.maxLength");
    expect(schemaProblem({ type: "object", properties: { x: { anyOf: [] } } })?.path).toBe("properties.x.anyOf");
    expect(schemaProblem({ type: "object", properties: { x: { anyOf: [{ type: "string" }, 3] } } })?.path).toBe("properties.x.anyOf.1");
    expect(schemaProblem({ type: "object", properties: { x: { type: "object", properties: { y: { type: "nope" } } } } })?.path).toBe(
      "properties.x.properties.y.type",
    );
    expect(schemaProblem({ type: "object", additionalProperties: "no" })?.path).toBe("additionalProperties");
  });

  it("refuses nesting without end", () => {
    let deep: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 20; i++) deep = { type: "object", properties: { a: deep } };
    expect(schemaProblem(deep)?.message).toMatch(/levels deep/);
  });

  it("reads as one line", () => {
    expect(describeSchemaProblem({ path: "properties.x", message: "Must be text." })).toBe("properties.x: Must be text.");
    expect(describeSchemaProblem({ path: "", message: "A schema is a JSON object." })).toBe("A schema is a JSON object.");
  });
});

describe("reading a malformed schema", () => {
  // Saved before the server checked shapes; the Schema tab must still render so it can be fixed.
  const broken = {
    type: "object",
    properties: { x: null, y: "string", z: { type: "array", items: 3 }, w: { anyOf: [null, { type: "string" }] }, e: { enum: [undefined] } },
    required: "x",
  } as unknown as JsonSchema;

  it("lists what it can instead of throwing", () => {
    expect(schemaFields(broken)).toEqual([
      { name: "x", type: "any", required: false, description: null, constraints: [] },
      { name: "y", type: "any", required: false, description: null, constraints: [] },
      { name: "z", type: "array", required: false, description: null, constraints: [] },
      { name: "w", type: "any | string", required: false, description: null, constraints: [] },
      { name: "e", type: "enum", required: false, description: null, constraints: ["undefined"] },
    ]);
    expect(schemaFields({ properties: [1, 2] } as unknown as JsonSchema)).toEqual([]);
    expect(schemaFields(null as unknown as JsonSchema)).toEqual([]);
  });

  it("builds an example body all the same", () => {
    expect(exampleInput(broken)).toEqual({});
    expect(exampleInput({ type: "object", properties: { n: { type: "integer", minimum: "3" } }, required: ["n"] })).toEqual({ n: 1 });
    expect(exampleInput({ type: "object", properties: { c: { enum: [] , type: "string" } }, required: ["c"] })).toEqual({ c: "…" });
  });
});
