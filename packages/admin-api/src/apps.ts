import { request } from "./client";
import type { S } from "./schema";

/*
 * Apps are curated workflows on top of catalog models (background remover,
 * upscaler, product shots). Each release pins the exact model versions its
 * steps call, so a new model version never changes a live app by surprise;
 * shipping one means a new release. Deploying publishes a release, and a
 * rollback publishes an earlier one again.
 *
 * Pausing is a kill switch that only `resumeApp` lifts: deploying or rolling
 * back a paused app makes that release the live release, but the app stays
 * paused and runs keep failing with 503 `app_paused` until it is resumed.
 */

export type AppCategory = S["AppCategory"];
export const APP_CATEGORIES = ["image", "video", "audio", "3d"] as const satisfies readonly AppCategory[];

export type AppStatus = S["AppStatus"];
export const APP_STATUSES = ["draft", "live", "paused"] as const satisfies readonly AppStatus[];

export type ReleaseStatus = S["ReleaseStatus"];
export const RELEASE_STATUSES = ["draft", "live", "superseded"] as const satisfies readonly ReleaseStatus[];

export type AppStep = S["AppStep"];
export type AppRelease = S["AppRelease"];
export type AppSummary = S["AppSummary"];
export type App = S["App"];
export type NewApp = S["NewApp"];
export type AppUpdate = S["AppUpdate"];
export type ReleaseUpdate = S["ReleaseUpdate"];

export const listApps = () => request<AppSummary[]>("/apps");

const path = encodeURIComponent;

export const getApp = (slug: string) => request<App>(`/apps/${path(slug)}`);

export const createApp = (body: NewApp) => request<App>("/apps", { method: "POST", body });

export const updateApp = (slug: string, body: AppUpdate) => request<App>(`/apps/${path(slug)}`, { method: "PATCH", body });

export const createRelease = (slug: string) => request<App>(`/apps/${path(slug)}/releases`, { method: "POST" });

export const updateRelease = (slug: string, number: number, body: ReleaseUpdate) =>
  request<App>(`/apps/${path(slug)}/releases/${number}`, { method: "PATCH", body });

export const publishRelease = (slug: string, number: number, body: S["PublishRelease"] = {}) =>
  request<App>(`/apps/${path(slug)}/releases/${number}/publish`, { method: "POST", body });

export const rollbackApp = (slug: string, number: number) => request<App>(`/apps/${path(slug)}/rollback`, { method: "POST", body: { release: number } });

export const pauseApp = (slug: string, reason: string) => request<App>(`/apps/${path(slug)}/pause`, { method: "POST", body: { reason } });

export const resumeApp = (slug: string) => request<App>(`/apps/${path(slug)}/resume`, { method: "POST" });
