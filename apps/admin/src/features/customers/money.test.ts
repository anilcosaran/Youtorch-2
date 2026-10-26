import { describe, expect, it } from "vitest";
import { DECIMAL_COMMA_MESSAGE, dollarsError, parseCount, parseDollars } from "./money";

describe("parseDollars", () => {
  it("reads plain amounts with up to two decimals and an optional $", () => {
    expect(parseDollars("25")).toBe(25);
    expect(parseDollars("12.50")).toBe(12.5);
    expect(parseDollars("0.5")).toBe(0.5);
    expect(parseDollars(" $40 ")).toBe(40);
    expect(parseDollars("$ 40.05")).toBe(40.05);
    expect(parseDollars("12.")).toBe(12);
  });

  it("is null for an empty box", () => {
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("   ")).toBeNull();
    expect(parseDollars("$")).toBeNull();
  });

  it("takes commas between thousands", () => {
    expect(parseDollars("1,234")).toBe(1234);
    expect(parseDollars("1,234.56")).toBe(1234.56);
    expect(parseDollars("$12,500,000.00")).toBe(12_500_000);
  });

  it("refuses a comma used for cents instead of reading it as thousands", () => {
    // "12,50" used to become 1250 and "1,5" 15.
    for (const text of ["12,50", "1,5", "0,99", "1.234,56", "1,234,5"]) {
      expect(parseDollars(text), text).toBeNaN();
      expect(dollarsError(text), text).toBe(DECIMAL_COMMA_MESSAGE);
    }
  });

  it("refuses anything else that isn't an amount", () => {
    for (const text of ["12.505", "1,23,456", "12,5000", "1,000,", "-5", "abc", "1e3", ".5", "1 000"]) {
      expect(parseDollars(text), text).toBeNaN();
      expect(dollarsError(text), text).toMatch(/at most two decimals/);
    }
  });

  it("has no error for amounts or an empty box", () => {
    expect(dollarsError("")).toBeNull();
    expect(dollarsError("1,250.00")).toBeNull();
    expect(dollarsError("0")).toBeNull();
  });
});

describe("parseCount", () => {
  it("reads whole numbers, with commas only between thousands", () => {
    expect(parseCount("120")).toBe(120);
    expect(parseCount("1,000")).toBe(1000);
    expect(parseCount(" 2,500,000 ")).toBe(2_500_000);
    expect(parseCount("")).toBeNull();
  });

  it("refuses decimals and decimal commas", () => {
    for (const text of ["1,5", "10,00", "1.5", "1,0000", "-3"]) expect(parseCount(text), text).toBeNaN();
  });
});
