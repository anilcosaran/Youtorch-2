import { describe, expect, it } from "vitest";
import { matchesQuery } from "./search";

describe("matchesQuery", () => {
  it("matches every word anywhere in the texts, ignoring case", () => {
    expect(matchesQuery("cust", "Customers")).toBe(true);
    expect(matchesQuery("AUDIT log", "Audit log")).toBe(true);
    expect(matchesQuery("tenants", "Customers", "users tenants workspaces")).toBe(true);
    expect(matchesQuery("log jobs", "Audit log", "history")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    expect(matchesQuery("", "Anything")).toBe(true);
    expect(matchesQuery("   ", "Anything")).toBe(true);
  });

  it("skips missing texts", () => {
    expect(matchesQuery("jobs", undefined, "Jobs")).toBe(true);
    expect(matchesQuery("jobs", undefined)).toBe(false);
  });
});
