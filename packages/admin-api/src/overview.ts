import { request, type Range } from "./client";
import type { S } from "./schema";

/*
 * Any signed-in operator may load the overview, but each figure needs the
 * permission that guards the same data on its own screen. The server leaves out
 * what the operator can't see, and the panel hides what is missing; `null`
 * keeps its own meaning: no traffic, so no rate. The table is in api/admin.yaml.
 */

export type OverviewDay = S["OverviewDay"];
export type OverviewTotals = S["OverviewTotals"];
export type OverviewModel = S["OverviewModel"];
export type OverviewProvider = S["OverviewProvider"];
export type Overview = S["Overview"];

export const getOverview = (range: Range) => request<Overview>("/overview", { query: { range } });
