import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, errorMessage, fieldErrors, isUnauthorized, request } from "./client";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

async function failure(response: Response, options?: Parameters<typeof request>[1]) {
  fetchMock.mockResolvedValueOnce(response);
  const error = await request("/thing", options).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("request", () => {
  it("sends a GET to the admin API with the query, dropping empty values", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [], nextCursor: null }));
    const page = await request("/workspaces", {
      query: { query: "acme", limit: 50, paused: true, cursor: undefined, plan: null, state: "" },
    });

    expect(page).toEqual({ items: [], nextCursor: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/v1/workspaces?query=acme&limit=50&paused=true");
    expect(init).toMatchObject({
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
  });

  it("sends JSON with a content type on writes", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      request("/workspaces/w1/pause", { method: "POST", body: { reason: "Spam" } }),
    ).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: '{"reason":"Spam"}',
    });
  });

  it("turns a network failure into a status 0 error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(request("/a")).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("rethrows the abort when the caller cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectedValueOnce(abort);
    await expect(request("/a", { signal: controller.signal })).rejects.toBe(abort);
  });
});

describe("request errors", () => {
  it("reads code, message and fields from the error envelope", async () => {
    const error = await failure(
      json(409, {
        error: { code: "email_taken", message: "Already an operator.", fields: { email: "Taken." } },
      }),
    );
    expect(error).toMatchObject({
      status: 409,
      code: "email_taken",
      message: "Already an operator.",
      fields: { email: "Taken." },
    });
  });

  it.each([
    [403, "You don't have permission for that."],
    [404, "That no longer exists."],
    [504, "The server took too long to answer. Try again."],
    [507, "Something went wrong on the server. Try again in a moment."],
  ])("falls back to the message for %i", async (status, message) => {
    const error = await failure(new Response("<html></html>", { status }));
    expect(error.code).toBe("unknown");
    expect(error.message).toBe(message);
    expect(error.fields).toEqual({});
  });

  it("uses the fallback when the message is empty", async () => {
    const error = await failure(json(422, { error: { code: "invalid", message: "" } }));
    expect(error.message).toBe("Some fields need another look.");
  });

  it.each([
    ["1", "Too many attempts. Try again in 1 second."],
    ["45", "Too many attempts. Try again in 45 seconds."],
    ["90", "Too many attempts. Try again in 2 minutes."],
    ["900", "Too many attempts. Try again in 15 minutes."],
    ["soon", "Too many attempts. Try again shortly."],
  ])("words a 429 with Retry-After %s", async (retryAfter, message) => {
    const error = await failure(new Response("", { status: 429, headers: { "Retry-After": retryAfter } }));
    expect(error.code).toBe("rate_limited");
    expect(error.message).toBe(message);
  });
});

describe("request on 401", () => {
  it("sends the browser to sign in and back", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/reviews", search: "?verdict=block", assign } });
    const error = await failure(new Response("", { status: 401 }));
    expect(error.message).toBe("Your session has ended. Sign in again.");
    expect(assign).toHaveBeenCalledWith("/login?next=%2Freviews%3Fverdict%3Dblock");
  });

  it("stays put on the sign-in page and when the caller handles it", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/login", search: "", assign } });
    await failure(new Response("", { status: 401 }));
    vi.stubGlobal("window", { location: { pathname: "/users", search: "", assign } });
    await failure(new Response("", { status: 401 }), { redirectOnUnauthorized: false });
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("error helpers", () => {
  const unauthorized = new ApiError(401, "unauthorized", "Signed out");
  const invalid = new ApiError(422, "invalid", "Check the form", { name: "Required." });

  it("errorMessage prefers the thrown message", () => {
    expect(errorMessage(invalid)).toBe("Check the form");
    expect(errorMessage(new Error("Boom"))).toBe("Boom");
    expect(errorMessage(new Error(""))).toBe(
      "Something went wrong on the server. Try again in a moment.",
    );
    expect(errorMessage(null)).toBe("Something went wrong on the server. Try again in a moment.");
  });

  it("fieldErrors is empty for anything but an API error", () => {
    expect(fieldErrors(invalid)).toEqual({ name: "Required." });
    expect(fieldErrors(unauthorized)).toEqual({});
    expect(fieldErrors(new Error("x"))).toEqual({});
  });

  it("isUnauthorized checks for a 401 API error", () => {
    expect(isUnauthorized(unauthorized)).toBe(true);
    expect(isUnauthorized(invalid)).toBe(false);
    expect(isUnauthorized({ status: 401 })).toBe(false);
  });
});
