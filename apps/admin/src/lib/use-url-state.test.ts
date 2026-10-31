import { describe, expect, it } from "vitest";
import { patchQuery, pick } from "./use-url-state";

const STATES = ["queued", "running", "failed"] as const;

describe("pick", () => {
  it("returns an allowed value", () => {
    expect(pick("running", STATES)).toBe("running");
  });

  it("drops unknown, differently cased and missing values", () => {
    expect(pick("done", STATES)).toBeUndefined();
    expect(pick("Running", STATES)).toBeUndefined();
    expect(pick("", STATES)).toBeUndefined();
    expect(pick(undefined, STATES)).toBeUndefined();
  });
});

describe("patchQuery", () => {
  it("sets and removes values", () => {
    expect(patchQuery("a=1&b=2", { a: "3", b: null, c: "4" })).toBe("a=3&c=4");
    expect(patchQuery("a=1", { a: "" })).toBe("");
  });

  it("goes back to the first page when a filter changes", () => {
    expect(patchQuery("status=held&cursor=x", { status: "failed" })).toBe("status=failed");
  });

  it("keeps the page when only the cursor or the open panel changes", () => {
    expect(patchQuery("cursor=x", { panel: "task:t1" })).toBe("cursor=x&panel=task:t1");
    expect(patchQuery("cursor=x&panel=task:t1", { panel: null })).toBe("cursor=x");
    expect(patchQuery("cursor=x", { cursor: "y" })).toBe("cursor=y");
  });

  it("keeps the open panel readable when a filter changes", () => {
    expect(patchQuery("panel=task:p1&status=held", { status: "failed" })).toBe("panel=task:p1&status=failed");
  });

  it("accepts a leading question mark", () => {
    expect(patchQuery("?tab=history", { panel: "task:t2" })).toBe("tab=history&panel=task:t2");
  });
});
