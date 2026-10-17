import type { NextRequest } from "next/server";
import { can } from "@/lib/permissions";
import { apiKeyRoutes } from "./handlers/api-keys";
import { appRoutes } from "./handlers/apps";
import { auditRoutes } from "./handlers/audit";
import { authRoutes } from "./handlers/auth";
import { customerRoutes } from "./handlers/customers";
import { modelRoutes } from "./handlers/models";
import { operatorRoutes } from "./handlers/operators";
import { overviewRoutes } from "./handlers/overview";
import { providerRoutes } from "./handlers/providers";
import { requestRoutes } from "./handlers/requests";
import { MockError, badRequest, errorResponse, fail } from "./http";
import { matchRoute, type RouteDef } from "./router";
import { currentOperator } from "./session";
import { getStore } from "./store";
import { isObject, type Body } from "./validate";

/*
 * An in-memory admin API for development: the contract in `src/lib/api`,
 * answered from seeded data that lives until the server restarts.
 */

export { MOCK_PASSWORD } from "./seed/operators";

/** Simulated latency per request, in milliseconds; tests set it to [0, 0]. */
export const mockSettings = { latencyMs: [120, 300] as [number, number] };

const PREFIX = "/admin/v1";

const ROUTES: RouteDef[] = [
  ...authRoutes,
  ...operatorRoutes,
  ...auditRoutes,
  ...overviewRoutes,
  ...modelRoutes,
  ...appRoutes,
  ...providerRoutes,
  ...customerRoutes,
  ...apiKeyRoutes,
  ...requestRoutes,
];

async function readBody(request: Request): Promise<Body> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const text = await request.text();
  if (text.trim() === "") return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return badRequest("The body isn't valid JSON.");
  }
  return isObject(body) ? body : badRequest("The body must be a JSON object.");
}

async function dispatch(request: NextRequest, path: string): Promise<Response> {
  const local = path === PREFIX || path.startsWith(`${PREFIX}/`) ? path.slice(PREFIX.length) : null;
  const match = local === null ? null : matchRoute(ROUTES, request.method.toUpperCase(), local);
  if (!match) return fail(404, "not_found", "There's no such endpoint.");
  if ("methods" in match) return fail(405, "method_not_allowed", `Use ${match.methods.join(" or ")} here.`);

  const { route, params } = match;
  const store = getStore();
  const operator = currentOperator(store, request);
  if (route.access !== "public") {
    if (!operator) fail(401, "unauthorized", "Your session has ended. Sign in again.");
    if (route.access !== "signed-in" && !can(operator, route.access)) fail(403, "forbidden", "You don't have permission for that.");
  }
  const body = await readBody(request);
  const result = await route.handler({ store, request, params, query: request.nextUrl.searchParams, body, operator });
  if (result instanceof Response) return result;
  if (result === undefined) return new Response(null, { status: 204 });
  return Response.json(result);
}

/** Answers an admin API request (`path` like `/admin/v1/models`) from the in-memory store. */
export async function handleMock(request: NextRequest, path: string): Promise<Response> {
  const [min, max] = mockSettings.latencyMs;
  if (max > 0) await new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
  try {
    return await dispatch(request, path);
  } catch (error) {
    if (error instanceof MockError) return errorResponse(error);
    console.error("[mock-api]", error);
    return Response.json({ error: { code: "internal", message: "The mock API failed; see the server log." } }, { status: 500 });
  }
}
