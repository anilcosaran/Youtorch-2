import { describe, expect, it } from "vitest";
import { LIMIT_NAMES, limitsFor, loweredLimits, type Limits } from "@modelvend/admin-api/customers";
import { formatLimit, LIMIT_DESCRIPTIONS, LIMIT_LABELS, limitText, parseLimit } from "./limits";

describe("parseLimit", () => {
  it("is null for an empty box, which follows the platform default", () => {
    for (const name of LIMIT_NAMES) expect(parseLimit(name, ""), name).toBeNull();
  });

  it("takes money limits in dollars and answers in micro-dollars", () => {
    expect(parseLimit("dailySpendMicros", "250")).toBe(250_000_000);
    expect(parseLimit("topUpMinMicros", "12.50")).toBe(12_500_000);
    expect(parseLimit("monthlySpendMicros", "1,000")).toBe(1_000_000_000);
    expect(parseLimit("dailySpendMicros", "0")).toBeNaN();
    expect(parseLimit("dailySpendMicros", "12,50")).toBeNaN();
  });

  it("holds counts to the contract's bounds, not a million", () => {
    expect(parseLimit("requestsPerMinute", "100000")).toBe(100_000);
    expect(parseLimit("requestsPerMinute", "100001")).toBeNaN();
    expect(parseLimit("requestsPerMinute", "0")).toBeNaN();
    expect(parseLimit("concurrency", "10000")).toBe(10_000);
    expect(parseLimit("concurrency", "10001")).toBeNaN();
    expect(parseLimit("queueSize", "0")).toBe(0);
    expect(parseLimit("queueSize", "100001")).toBeNaN();
    expect(parseLimit("queueWaitSeconds", "86400")).toBe(86_400);
    expect(parseLimit("queueWaitSeconds", "86401")).toBeNaN();
    expect(parseLimit("subAccounts", "1000")).toBe(1000);
    expect(parseLimit("subAccounts", "1001")).toBeNaN();
  });
});

describe("limitText", () => {
  it("shows money in dollars and comes back to the same micro-dollars", () => {
    expect(limitText("dailySpendMicros", 250_000_000)).toBe("250");
    expect(limitText("topUpMinMicros", 12_500_000)).toBe("12.5");
    expect(parseLimit("topUpMinMicros", limitText("topUpMinMicros", 12_500_000))).toBe(12_500_000);
    expect(limitText("queueWaitSeconds", 3600)).toBe("3600");
    expect(limitText("dailySpendMicros", null)).toBe("");
  });
});

describe("formatLimit", () => {
  it("reads in dollars, seconds or a count, and a null spend limit as none", () => {
    expect(formatLimit("monthlySpendMicros", 250_000_000)).toBe("$250.00");
    expect(formatLimit("monthlySpendMicros", null)).toBe("None");
    expect(formatLimit("queueWaitSeconds", 3600)).toBe("1h");
    expect(formatLimit("queueWaitSeconds", 90)).toBe("90 s");
    expect(formatLimit("requestsPerMinute", 1200)).toBe("1,200");
  });
});

describe("the ten limits", () => {
  const defaults: Limits = {
    requestsPerMinute: 120,
    concurrency: 10,
    queueSize: 50,
    queueWaitSeconds: 3600,
    dailySpendMicros: null,
    monthlySpendMicros: null,
    subAccounts: 10,
    topUpMinMicros: 5_000_000,
    topUpMaxMicros: 10_000_000_000,
    firstWeekDailyTopUpMicros: 500_000_000,
  };

  it("each has a label and a description", () => {
    for (const name of LIMIT_NAMES) {
      expect(LIMIT_LABELS[name], name).toBeTruthy();
      expect(LIMIT_DESCRIPTIONS[name], name).toBeTruthy();
    }
  });

  it("needs a reason when a change lowers one, or adds a spend limit where there was none", () => {
    expect(loweredLimits(defaults, limitsFor(defaults, { concurrency: 20 }))).toEqual([]);
    expect(loweredLimits(defaults, limitsFor(defaults, { concurrency: 5 }))).toEqual(["concurrency"]);
    expect(loweredLimits(defaults, limitsFor(defaults, { dailySpendMicros: 1_000_000 }))).toEqual(["dailySpendMicros"]);
  });
});
