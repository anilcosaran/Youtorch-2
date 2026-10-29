import { request } from "./client";

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

export const APP_CATEGORIES = ["image", "video", "audio", "3d"] as const;
export type AppCategory = (typeof APP_CATEGORIES)[number];

export const APP_STATUSES = ["draft", "live", "paused"] as const;
export type AppStatus = (typeof APP_STATUSES)[number];

export const RELEASE_STATUSES = ["draft", "live", "superseded"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export interface AppStep {
  id: string;
  name: string;
  modelId: string;
  /** Pinned version; apps never follow a model's default. */
  version: string;
  /** Fixed inputs, merged under what the user sends; `{{input.image}}` refers to the run's input. */
  params: Record<string, unknown>;
}

export interface AppRelease {
  number: number;
  status: ReleaseStatus;
  steps: AppStep[];
  /** What one run costs the customer. */
  price: number;
  /** Upstream cost of one run at the steps' default tiers. */
  cost: number;
  notes: string;
  createdAt: string;
  createdBy: string | null;
  publishedAt: string | null;
}

export interface AppSummary {
  slug: string;
  name: string;
  tagline: string;
  category: AppCategory;
  status: AppStatus;
  liveRelease: number | null;
  draftRelease: number | null;
  /** Models the live release calls. */
  models: string[];
  price: number | null;
  runs24h: number;
  revenue30d: number;
  updatedAt: string;
}

export interface App extends AppSummary {
  description: string;
  /** Why the app is paused, when it is. */
  pausedReason: string | null;
  releases: AppRelease[];
}

export interface NewApp {
  slug: string;
  name: string;
  tagline: string;
  category: AppCategory;
}

export type AppUpdate = Partial<Pick<App, "name" | "tagline" | "description" | "category">>;

export type ReleaseUpdate = Partial<Pick<AppRelease, "steps" | "price" | "notes">>;

export const listApps = () => request<AppSummary[]>("/apps");

const path = encodeURIComponent;

export const getApp = (slug: string) => request<App>(`/apps/${path(slug)}`);

/** 409 `fields.slug` when it is taken. The app starts as a draft with an empty release 1. */
export const createApp = (body: NewApp) => request<App>("/apps", { method: "POST", body });

/** Nothing changes unless every field is valid. */
export const updateApp = (slug: string, body: AppUpdate) => request<App>(`/apps/${path(slug)}`, { method: "PATCH", body });

/** A new draft release, copied from the live one when there is one. 409 when a draft exists. */
export const createRelease = (slug: string) => request<App>(`/apps/${path(slug)}/releases`, { method: "POST" });

/** Only draft releases change; nothing changes unless every field is valid. */
export const updateRelease = (slug: string, number: number, body: ReleaseUpdate) =>
  request<App>(`/apps/${path(slug)}/releases/${number}`, { method: "PATCH", body });

/**
 * Deploys the release: it becomes the live release and the previous one is
 * superseded. A draft app goes live; a paused app stays paused (`status` and
 * `pausedReason` don't change) until `resumeApp`. 422 `version_not_live` when
 * a step names a model version that isn't live.
 */
export const publishRelease = (slug: string, number: number) =>
  request<App>(`/apps/${path(slug)}/releases/${number}/publish`, { method: "POST" });

/**
 * Makes a superseded release the live release again; its steps may use
 * deprecated versions, which still answer. Like a deploy, it leaves a paused
 * app paused.
 */
export const rollbackApp = (slug: string, number: number) =>
  request<App>(`/apps/${path(slug)}/rollback`, { method: "POST", body: { release: number } });

/** New runs fail with 503 `app_paused` until `resumeApp`; deploys and rollbacks don't lift it. */
export const pauseApp = (slug: string, reason: string) =>
  request<App>(`/apps/${path(slug)}/pause`, { method: "POST", body: { reason } });

export const resumeApp = (slug: string) => request<App>(`/apps/${path(slug)}/resume`, { method: "POST" });
