import { describe, expect, it } from "vitest";
import type { Overview } from "@modelvend/admin-api/overview";
import { permissionsFor } from "@/lib/permissions";
import { anySection, overviewSections } from "./sections";

const day = { day: "2026-10-26" };

describe("overview sections", () => {
  it("shows what the server sent and hides what it left out", () => {
    const data: Overview = { totals: { cost: 10, providersDegraded: 1 }, series: [{ ...day, cost: 10 }], providers: [] };
    expect(overviewSections(data, null)).toEqual({
      traffic: false,
      revenue: false,
      cost: true,
      margin: false,
      customers: false,
      catalog: false,
      providers: true,
    });
  });

  it("keeps a null margin, which means no revenue yet", () => {
    const data: Overview = { totals: { revenue: 0, cost: 0, margin: null }, series: [day] };
    expect(overviewSections(data, null)).toMatchObject({ revenue: true, cost: true, margin: true });
  });

  it("goes by permissions until the data loads, and by nothing before the operator does", () => {
    expect(overviewSections(undefined, null)).toBeNull();
    const finance = overviewSections(undefined, permissionsFor({ role: "custom", permissions: ["customers.view", "providers.view"] }));
    expect(finance).toEqual({
      traffic: false,
      revenue: true,
      cost: true,
      margin: true,
      customers: true,
      catalog: false,
      providers: true,
    });
    const audit = overviewSections(undefined, permissionsFor({ role: "custom", permissions: ["audit.view"] }));
    expect(audit && anySection(audit)).toBe(false);
  });
});
