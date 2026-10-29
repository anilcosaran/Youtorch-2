import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@modelvend/admin-api/client";
import { fieldLabel, formErrors, toastError } from "./notify";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => toast.error.mockReset());

/** A 422 the way the server sends one: the message is the (first) field's. */
const invalid = (fields: Record<string, string>) =>
  new ApiError(422, "validation_failed", Object.values(fields)[0] ?? "Some fields need another look.", fields);

describe("formErrors", () => {
  it("puts errors on the fields the form shows", () => {
    expect(formErrors(invalid({ upstreamModel: "Enter the provider's model ID." }), ["upstreamModel", "cost.price"])).toEqual({
      fields: { upstreamModel: "Enter the provider's model ID." },
      message: null,
    });
  });

  it("names the field in the form error when the form has no place for it", () => {
    const error = invalid({ priority: "Must be at most 100.", "cost.price": "Must be at least 0." });
    expect(formErrors(error, ["cost.price"])).toEqual({
      fields: { "cost.price": "Must be at least 0." },
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
});

describe("fieldLabel", () => {
  it("reads server field names", () => {
    expect(fieldLabel("maxConcurrency")).toBe("Max concurrency");
    expect(fieldLabel("cost.price")).toBe("Cost price");
    expect(fieldLabel("limits.monthlySpendCap")).toBe("Monthly spend cap");
    expect(fieldLabel("tier", { tier: "Tier" })).toBe("Tier");
  });
});

describe("toastError with a field error", () => {
  it("says which field the message is about", () => {
    toastError(invalid({ "routing.maxAttempts": "Must be at most 5." }), "Couldn't save the routing");
    expect(toast.error).toHaveBeenLastCalledWith("Couldn't save the routing", { description: "Routing max attempts: Must be at most 5." });
  });
});
