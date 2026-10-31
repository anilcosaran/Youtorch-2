import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@modelvend/admin-api/client";
import { fieldLabel, formErrors, isStale, lowMarginMessage, toastError } from "./notify";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => toast.error.mockReset());

/** A 422 the way the server sends one: the message is the (first) field's. */
const invalid = (fields: Record<string, string>) =>
  new ApiError(422, "validation_failed", Object.values(fields)[0] ?? "Some fields need another look.", fields);

describe("formErrors", () => {
  it("puts errors on the fields the form shows", () => {
    expect(formErrors(invalid({ upstreamModel: "Enter the provider's model ID." }), ["upstreamModel", "tierCosts.1080p"])).toEqual({
      fields: { upstreamModel: "Enter the provider's model ID." },
      message: null,
    });
  });

  it("names the field in the form error when the form has no place for it", () => {
    const error = invalid({ priority: "Must be at most 100.", "tierCosts.1080p": "Must be at least 0." });
    expect(formErrors(error, ["tierCosts.1080p"])).toEqual({
      fields: { "tierCosts.1080p": "Must be at least 0." },
      message: "Priority: Must be at most 100.",
    });
    expect(formErrors(invalid({ maxConcurrency: "Must be a whole number." }), [], { maxConcurrency: "Max concurrency" }).message).toBe(
      "Max concurrency: Must be a whole number.",
    );
  });

  it("falls back to the error's own message without field errors", () => {
    expect(formErrors(new ApiError(409, "conflict", "Release 4 is already a draft."), ["name"])).toEqual({
      fields: {},
      message: "Release 4 is already a draft.",
    });
    expect(formErrors(new Error("Boom"), []).message).toBe("Boom");
  });

  it("names the step or output map a release is refused for", () => {
    const refused = new ApiError(422, "invalid_release", "A template reads a step that hasn't run.", {
      "steps.1.input": "A template reads a step that hasn't run.",
    });
    expect(formErrors(refused, []).message).toBe("Steps 1 input: A template reads a step that hasn't run.");
  });
});

describe("fieldLabel", () => {
  it("reads server field names", () => {
    expect(fieldLabel("maxConcurrency")).toBe("Max concurrency");
    expect(fieldLabel("steps.0.input")).toBe("Steps 0 input");
    expect(fieldLabel("limits.requestsPerMinute")).toBe("Requests per minute");
    expect(fieldLabel("tier", { tier: "Tier" })).toBe("Tier");
  });
});

describe("lowMarginMessage", () => {
  it("reads the message from the reason field", () => {
    const refused = new ApiError(422, "low_margin", "Under the minimum.", { reason: "The 4k tier is under the 20% minimum margin." });
    expect(lowMarginMessage(refused)).toBe("The 4k tier is under the 20% minimum margin.");
  });

  it("falls back to the error's own message, and is null for any other failure", () => {
    expect(lowMarginMessage(new ApiError(422, "low_margin", "Under the minimum."))).toBe("Under the minimum.");
    expect(lowMarginMessage(new ApiError(403, "below_cost", "Below cost."))).toBeNull();
    expect(lowMarginMessage(new ApiError(422, "no_route", "No route."))).toBeNull();
    expect(lowMarginMessage(new Error("Boom"))).toBeNull();
  });
});

describe("isStale", () => {
  it("knows a change refused for an old revision", () => {
    expect(isStale(new ApiError(409, "stale", "It changed."))).toBe(true);
    expect(isStale(new ApiError(409, "conflict", "Taken."))).toBe(false);
    expect(isStale(new Error("Boom"))).toBe(false);
  });
});

describe("toastError with a field error", () => {
  it("says which field the message is about", () => {
    toastError(invalid({ "routing.maxAttempts": "Must be at most 5." }), "Couldn't save the routing");
    expect(toast.error).toHaveBeenLastCalledWith("Couldn't save the routing", { description: "Routing max attempts: Must be at most 5." });
  });
});
