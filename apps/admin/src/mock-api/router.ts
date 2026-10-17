import type { NextRequest } from "next/server";
import type { Permission } from "@/lib/api/auth";
import { fail } from "./http";
import type { OperatorRecord, Store } from "./types";
import type { Body } from "./validate";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** What a handler gets. */
export interface Context {
  store: Store;
  request: NextRequest;
  /** Decoded path parameters. */
  params: Record<string, string>;
  query: URLSearchParams;
  /** The JSON body; empty for GET. */
  body: Body;
  /** The signed-in operator; null only on public routes. */
  operator: OperatorRecord | null;
}

/** Returns the JSON to answer with, a Response, or undefined for 204. */
export type Handler = (ctx: Context) => unknown;

/** A permission, any signed-in operator, or anyone. */
export type Access = Permission | "signed-in" | "public";

export interface RouteDef {
  method: Method;
  /** Relative to `/admin/v1`, with `:name` parameters, e.g. `/models/:publisher/:slug`. */
  pattern: string;
  access: Access;
  handler: Handler;
}

export const route = (method: Method, pattern: string, access: Access, handler: Handler): RouteDef => ({
  method,
  pattern,
  access,
  handler,
});

/** The signed-in operator; 401 when there is none. */
export function actor(ctx: Context): OperatorRecord {
  return ctx.operator ?? fail(401, "unauthorized", "Sign in to continue.");
}

const segments = (path: string) => path.split("/").filter(Boolean);

function matchPattern(pattern: string, parts: string[]): Record<string, string> | null {
  const expected = segments(pattern);
  if (expected.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].startsWith(":")) {
      try {
        params[expected[i].slice(1)] = decodeURIComponent(parts[i]);
      } catch {
        return null;
      }
    } else if (expected[i] !== parts[i]) {
      return null;
    }
  }
  return params;
}

export type Match = { route: RouteDef; params: Record<string, string> } | { methods: Method[] } | null;

/** The route for the method and path; the allowed methods when only the path matches; null when nothing does. */
export function matchRoute(routes: readonly RouteDef[], method: string, path: string): Match {
  const parts = segments(path);
  const methods: Method[] = [];
  for (const candidate of routes) {
    const params = matchPattern(candidate.pattern, parts);
    if (!params) continue;
    if (candidate.method === method) return { route: candidate, params };
    methods.push(candidate.method);
  }
  return methods.length > 0 ? { methods } : null;
}
