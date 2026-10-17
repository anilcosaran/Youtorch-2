import { describe, expect, it } from "vitest";
import type { Model, ModelVersion } from "@modelvend/admin-api/models";
import { exampleInput, margin, marginTone, nextVersionId, parseSchema, pickVersion, schemaFields, slugify } from "./catalog";

describe("margin", () => {
  it("is the share of the price we keep", () => {
    expect(margin(0.1, 0.07)).toBeCloseTo(0.3);
    expect(margin(0.1, 0.12)).toBeCloseTo(-0.2);
  });

  it("is unknown without a price or a cost", () => {
    expect(margin(0, 0.05)).toBeNull();
    expect(margin(0.1, null)).toBeNull();
    expect(margin(undefined, 0.05)).toBeNull();
  });

  it("flags thin and negative margins", () => {
    expect(marginTone(0.4)).toBe("good");
    expect(marginTone(0.1)).toBe("warning");
    expect(marginTone(-0.01)).toBe("critical");
    expect(marginTone(null)).toBe("neutral");
  });
});

describe("nextVersionId", () => {
  it("counts on from the highest numbered version", () => {
    expect(nextVersionId(["v1", "v3", "v2"])).toBe("v4");
    expect(nextVersionId([])).toBe("v1");
    expect(nextVersionId(["2026-10-01"])).toBe("v1");
  });
});

describe("pickVersion", () => {
  const version = (id: string) => ({ id }) as ModelVersion;
  const model = { defaultVersion: "v2", versionList: [version("v3"), version("v2"), version("v1")] } as Pick<
    Model,
    "defaultVersion" | "versionList"
  >;

  it("prefers the requested version, then the default, then the newest", () => {
    expect(pickVersion(model, "v1")?.id).toBe("v1");
    expect(pickVersion(model, "v9")?.id).toBe("v2");
    expect(pickVersion({ ...model, defaultVersion: null })?.id).toBe("v3");
  });
});

describe("slugify", () => {
  it("makes URL-safe IDs", () => {
    expect(slugify("FLUX.2 Pro")).toBe("flux.2-pro");
    expect(slugify("  Kling 3.0 Türbo ")).toBe("kling-3.0-turbo");
    expect(slugify("--Veo--")).toBe("veo");
  });
});

describe("schemaFields", () => {
  const schema = {
    type: "object",
    required: ["prompt"],
    properties: {
      prompt: { type: "string", description: "What to make", maxLength: 2000 },
      duration: { type: "integer", enum: [5, 10], default: 5 },
      image_url: { type: "string", format: "uri" },
      seeds: { type: "array", items: { type: "integer" }, maxItems: 4 },
    },
  };

  it("lists top-level properties with their constraints", () => {
    expect(schemaFields(schema)).toEqual([
      { name: "prompt", type: "string", required: true, description: "What to make", constraints: ["up to 2000 chars"] },
      { name: "duration", type: "integer", required: false, description: null, constraints: ["default 5", "5, 10"] },
      { name: "image_url", type: "string", required: false, description: null, constraints: ["uri"] },
      { name: "seeds", type: "integer[]", required: false, description: null, constraints: ["up to 4 items"] },
    ]);
  });

  it("builds an example body from defaults and required fields", () => {
    expect(exampleInput(schema)).toEqual({ prompt: "…", duration: 5 });
  });
});

describe("parseSchema", () => {
  it("accepts JSON objects only", () => {
    expect(parseSchema('{"type":"object"}')).toEqual({ schema: { type: "object" } });
    expect(parseSchema("[]")).toEqual({ error: "A schema is a JSON object." });
    expect("error" in parseSchema("{")).toBe(true);
  });
});
