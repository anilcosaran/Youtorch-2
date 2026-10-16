import { describe, expect, it } from "vitest";
import {
  carryState,
  formatPanel,
  isTypingTarget,
  neighbours,
  nextAfter,
  PANEL_ENTRY,
  panelFromQuery,
  panelHref,
  parsePanel,
  samePanel,
  stepFrom,
  stepKey,
  withPanel,
} from "./panel";

describe("parsePanel", () => {
  it("reads a kind and an ID", () => {
    expect(parsePanel("request:req_1")).toEqual({ kind: "request", id: "req_1" });
  });

  it("keeps colons inside the ID", () => {
    expect(parsePanel("request:a:b")).toEqual({ kind: "request", id: "a:b" });
  });

  it("drops unknown kinds, missing IDs and empty values", () => {
    expect(parsePanel("job:1")).toBeNull();
    expect(parsePanel("request:")).toBeNull();
    expect(parsePanel(":req_1")).toBeNull();
    expect(parsePanel("request")).toBeNull();
    expect(parsePanel("")).toBeNull();
    expect(parsePanel(null)).toBeNull();
  });

  it("round-trips through formatPanel", () => {
    const ref = { kind: "request", id: "req 1" } as const;
    expect(parsePanel(formatPanel(ref))).toEqual(ref);
  });
});

describe("panelFromQuery", () => {
  it("reads the panel parameter on any page", () => {
    expect(panelFromQuery(new URLSearchParams("tab=usage&panel=request:req_1"))).toEqual({
      kind: "request",
      id: "req_1",
    });
  });

  it("is null without one", () => {
    expect(panelFromQuery(new URLSearchParams("open=req_1"))).toBeNull();
    expect(panelFromQuery(new URLSearchParams())).toBeNull();
  });
});

describe("withPanel and panelHref", () => {
  it("opens an item over the current page and keeps its state", () => {
    expect(withPanel("tab=usage&status=failed", { kind: "request", id: "r1" })).toBe("tab=usage&status=failed&panel=request:r1");
    expect(panelHref("/customers/c1", "?tab=usage", { kind: "request", id: "r1" })).toBe("/customers/c1?tab=usage&panel=request:r1");
  });

  it("replaces the open item", () => {
    expect(withPanel("panel=request:r1", { kind: "request", id: "r2" })).toBe("panel=request:r2");
  });

  it("closes the panel", () => {
    expect(withPanel("tab=usage&panel=request:r1", null)).toBe("tab=usage");
    expect(withPanel("panel=request:r1", null)).toBe("");
  });

  it("encodes characters an ID shouldn't carry raw", () => {
    expect(withPanel("", { kind: "request", id: "a b&c" })).toBe("panel=request:a+b%26c");
  });
});

describe("samePanel", () => {
  it("compares kind and ID", () => {
    expect(samePanel({ kind: "request", id: "1" }, { kind: "request", id: "1" })).toBe(true);
    expect(samePanel({ kind: "request", id: "1" }, { kind: "request", id: "2" })).toBe(false);
    expect(samePanel({ kind: "request", id: "1" }, null)).toBe(false);
    expect(samePanel(null, null)).toBe(true);
  });
});

describe("carryState", () => {
  it("keeps the entry's own keys and leaves the router's out", () => {
    const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {}, [PANEL_ENTRY]: true };
    expect(carryState(state)).toEqual({ [PANEL_ENTRY]: true });
  });

  it("adds keys and starts from nothing", () => {
    expect(carryState(null, { [PANEL_ENTRY]: true })).toEqual({ [PANEL_ENTRY]: true });
    expect(carryState(undefined)).toEqual({});
  });
});

describe("stepFrom", () => {
  const ids = ["a", "b", "c"];

  it("moves to the next and previous item", () => {
    expect(stepFrom(ids, "b", 1)).toBe("c");
    expect(stepFrom(ids, "b", -1)).toBe("a");
  });

  it("stops at either end", () => {
    expect(stepFrom(ids, "c", 1)).toBeNull();
    expect(stepFrom(ids, "a", -1)).toBeNull();
  });

  it("doesn't move from an item that isn't on the list, or from nothing", () => {
    expect(stepFrom(ids, "x", 1)).toBeNull();
    expect(stepFrom(ids, undefined, 1)).toBeNull();
  });
});

describe("neighbours", () => {
  it("finds the items around one on the list", () => {
    expect(neighbours(["a", "b", "c"], "b")).toEqual({ previous: "a", next: "c" });
    expect(neighbours(["a", "b"], "a")).toEqual({ previous: null, next: "b" });
  });

  it("is null off the list", () => {
    expect(neighbours(["a"], "x")).toBeNull();
  });
});

describe("nextAfter", () => {
  it("opens the next item once one is done", () => {
    expect(nextAfter(["a", "b", "c"], "b")).toBe("c");
  });

  it("goes back one when the last item is done", () => {
    expect(nextAfter(["a", "b", "c"], "c")).toBe("b");
  });

  it("closes when nothing is left", () => {
    expect(nextAfter(["a"], "a")).toBeNull();
    expect(nextAfter([], "a")).toBeNull();
  });

  it("opens the first item when the done one wasn't on the list", () => {
    expect(nextAfter(["a", "b"], "x")).toBe("a");
  });
});

describe("stepKey", () => {
  const key = (k: string, mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {}) => ({
    key: k,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  });

  it("reads J and ↓ as next, K and ↑ as previous", () => {
    expect(stepKey(key("j"))).toBe(1);
    expect(stepKey(key("ArrowDown"))).toBe(1);
    expect(stepKey(key("k"))).toBe(-1);
    expect(stepKey(key("ArrowUp"))).toBe(-1);
  });

  it("ignores other keys and modified ones", () => {
    expect(stepKey(key("Enter"))).toBeNull();
    expect(stepKey(key("j", { ctrlKey: true }))).toBeNull();
    expect(stepKey(key("ArrowDown", { shiftKey: true }))).toBeNull();
  });
});

describe("isTypingTarget", () => {
  const element = (matches: boolean) => ({ closest: () => (matches ? {} : null) }) as unknown as EventTarget;

  it("leaves keys in fields alone", () => {
    expect(isTypingTarget(element(true))).toBe(true);
  });

  it("takes keys anywhere else", () => {
    expect(isTypingTarget(element(false))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
