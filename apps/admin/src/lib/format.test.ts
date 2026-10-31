import { describe, expect, it } from "vitest";
import {
  ago,
  badgeCount,
  compact,
  dateOnly,
  dateTime,
  day,
  dayLong,
  fromNow,
  hour,
  humanize,
  initials,
  integer,
  milliseconds,
  minutesSince,
  percent,
  plural,
  span,
  unitPrice,
  usd,
  usdAxis,
  usdCompact,
  usdPrecise,
  utc,
} from "./format";

describe("numbers", () => {
  it("groups thousands", () => {
    expect(integer(1284)).toBe("1,284");
    expect(integer(12.5)).toBe("12.5");
  });

  it("compacts from a thousand up and keeps smaller numbers exact", () => {
    expect(compact(999)).toBe("999");
    expect(compact(-999)).toBe("-999");
    expect(compact(1000)).toBe("1K");
    expect(compact(1284)).toBe("1.3K");
    expect(compact(-1500)).toBe("-1.5K");
    expect(compact(2_500_000)).toBe("2.5M");
  });

  it("formats shares as percentages", () => {
    expect(percent(0.4237)).toBe("42.4%");
    expect(percent(0.4237, 0)).toBe("42%");
    expect(percent(0)).toBe("0.0%");
  });
});

describe("badgeCount", () => {
  it("is exact up to 99", () => {
    expect(badgeCount(0)).toBe("0");
    expect(badgeCount(99)).toBe("99");
  });

  it("caps at 99+ and marks a count that may go higher", () => {
    expect(badgeCount(100)).toBe("99+");
    expect(badgeCount(100, true)).toBe("99+");
    expect(badgeCount(12, true)).toBe("12+");
  });
});

describe("usd", () => {
  it.each([
    [0, "$0.00"],
    [50_000, "$0.05"],
    [1_234_560_000, "$1,234.56"],
    [-5_000_000, "-$5.00"],
    [1_000_000_000_000, "$1,000,000.00"],
    [19_996_000, "$20.00"],
  ])("%d micro-dollars", (micros, expected) => {
    expect(usd(micros)).toBe(expected);
  });

  it("shows a dash for an unknown amount", () => {
    expect(usd(null)).toBe("—");
    expect(usd(undefined)).toBe("—");
    expect(usd(Number.NaN)).toBe("—");
  });
});

describe("usdCompact", () => {
  it("shortens from a thousand up", () => {
    expect(usdCompact(999_500_000)).toBe("$999.50");
    expect(usdCompact(12_840_000_000)).toBe("$12.8K");
    expect(usdCompact(-2_500_000_000_000)).toBe("-$2.5M");
  });
});

describe("usdAxis", () => {
  it("keeps a chart's ticks short and in dollars", () => {
    expect(usdAxis(0)).toBe("$0");
    expect(usdAxis(2_500_000)).toBe("$2.5");
    expect(usdAxis(250_000_000)).toBe("$250");
    expect(usdAxis(12_800_000_000)).toBe("$12.8K");
    expect(usdAxis(-1_000_000)).toBe("-$1");
  });
});

describe("usdPrecise", () => {
  it("keeps fractions of a cent under a dollar", () => {
    expect(usdPrecise(3500)).toBe("$0.0035");
    expect(usdPrecise(45_000)).toBe("$0.045");
    expect(usdPrecise(-500_000)).toBe("-$0.50");
    expect(usdPrecise(12_500_000)).toBe("$12.50");
    expect(usdPrecise(null)).toBe("—");
  });
});

describe("unitPrice", () => {
  it("keeps fractions of a cent", () => {
    expect(unitPrice(0.045)).toBe("$0.045");
    expect(unitPrice("0.084")).toBe("$0.084");
    expect(unitPrice(0.0035)).toBe("$0.0035");
    expect(unitPrice(1.2)).toBe("$1.20");
    expect(unitPrice(null)).toBe("—");
  });
});

describe("milliseconds", () => {
  it.each([
    [0, "0 ms"],
    [820.4, "820 ms"],
    [1000, "1.0 s"],
    [1449, "1.4 s"],
    [9_999, "10.0 s"],
    [10_000, "10 s"],
    [12_345, "12 s"],
  ])("%d", (ms, expected) => {
    expect(milliseconds(ms)).toBe(expected);
  });
});

describe("span", () => {
  it.each([
    [-5, "0m"],
    [0, "0m"],
    [45, "45m"],
    [59.6, "1h"],
    [60, "1h"],
    [192, "3h 12m"],
    [1439, "23h 59m"],
    [1440, "1d"],
    [1500, "1d 1h"],
    [3120, "2d 4h"],
  ])("%d minutes", (minutes, expected) => {
    expect(span(minutes)).toBe(expected);
  });
});

describe("dates", () => {
  it("formats local timestamps and calendar days", () => {
    expect(dateTime("2026-10-16T14:03:00")).toBe("16 Oct 2026, 14:03");
    expect(dateOnly("2026-10-16T14:03:00")).toBe("16 Oct 2026");
    expect(day("2026-10-16")).toBe("16 Oct");
    expect(dayLong("2026-10-16")).toBe("Fri 16 Oct");
    expect(hour("2026-10-16T09:00:00")).toBe("09:00");
  });

  it("shows the exact instant in UTC", () => {
    expect(utc("2026-10-16T14:03:27.987Z")).toBe("2026-10-16 14:03:27 UTC");
    expect(utc("2026-10-17T01:03:27+03:00")).toBe("2026-10-16 22:03:27 UTC");
  });
});

describe("ago", () => {
  const now = new Date("2026-10-16T14:00:00Z");

  it.each([
    ["2026-10-16T14:05:00Z", "just now"],
    ["2026-10-16T13:59:30Z", "just now"],
    ["2026-10-16T13:59:00Z", "1m ago"],
    ["2026-10-16T13:01:00Z", "59m ago"],
    ["2026-10-16T13:00:00Z", "1h ago"],
    ["2026-10-15T14:01:00Z", "23h ago"],
    ["2026-10-15T14:00:00Z", "1d ago"],
    ["2026-09-17T14:00:00Z", "29d ago"],
  ])("%s", (value, expected) => {
    expect(ago(value, now)).toBe(expected);
  });

  it("shows the date from 30 days on", () => {
    expect(ago("2026-09-01T12:00:00", now)).toBe("1 Sep 2026");
  });
});

describe("fromNow", () => {
  const now = new Date("2026-10-16T14:00:00Z");

  it.each([
    ["2026-10-16T14:00:30Z", "in under a minute"],
    ["2026-10-16T14:05:00Z", "in 5m"],
    ["2026-10-16T14:59:59Z", "in 59m"],
    ["2026-10-16T15:00:00Z", "in 1h"],
    ["2026-10-17T13:59:00Z", "in 23h"],
    ["2026-10-17T14:00:00Z", "in 1d"],
    ["2026-11-14T14:00:00Z", "in 29d"],
  ])("%s", (value, expected) => {
    expect(fromNow(value, now)).toBe(expected);
  });

  it("shows the date from 30 days ahead", () => {
    expect(fromNow("2026-12-01T12:00:00", now)).toBe("1 Dec 2026");
  });

  it("reads an instant already past as time ago", () => {
    expect(fromNow("2026-10-16T14:00:00Z", now)).toBe("just now");
    expect(fromNow("2026-10-16T11:00:00Z", now)).toBe("3h ago");
  });
});

it("minutesSince never goes negative", () => {
  const now = new Date("2026-10-16T14:00:00Z");
  expect(minutesSince("2026-10-16T12:30:00Z", now)).toBe(90);
  expect(minutesSince("2026-10-16T15:00:00Z", now)).toBe(0);
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("ada lovelace byron")).toBe("AL");
    expect(initials("  Grace   Hopper ")).toBe("GH");
    expect(initials("")).toBe("");
  });
});

describe("humanize", () => {
  it.each([
    ["connect_post", "Connect post"],
    ["workspace.paused", "Workspace paused"],
    ["re-auth__needed", "Re auth needed"],
    ["__edge__", "Edge"],
    ["", ""],
  ])("%s", (value, expected) => {
    expect(humanize(value)).toBe(expected);
  });
});

describe("plural", () => {
  it("picks the form by count", () => {
    expect(plural(1, "account")).toBe("1 account");
    expect(plural(0, "account")).toBe("0 accounts");
    expect(plural(1284, "post")).toBe("1,284 posts");
    expect(plural(2, "policy", "policies")).toBe("2 policies");
  });
});
