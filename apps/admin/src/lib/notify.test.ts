import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@modelvend/admin-api/client";
import { toastError } from "./notify";

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => toast.error.mockReset());

describe("toastError", () => {
  it("stays quiet on 401", () => {
    toastError(new ApiError(401, "unauthorized", "Signed out"), "Couldn't save");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the message alone or under a title", () => {
    toastError(new ApiError(403, "forbidden", "You don't have permission for that."));
    expect(toast.error).toHaveBeenLastCalledWith("You don't have permission for that.");

    toastError(new Error("Boom"), "Couldn't pause");
    expect(toast.error).toHaveBeenLastCalledWith("Couldn't pause", { description: "Boom" });
  });
});
