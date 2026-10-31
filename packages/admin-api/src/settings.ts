import { request } from "./client";
import type { S } from "./schema";

/*
 * Platform defaults: limits, the minimum margin, credit lifetimes, fees. They
 * change without a deploy. Any operator may read them, since the price and
 * limit screens need them; changing them needs settings.manage.
 */

export type Settings = S["Settings"];
export type SettingsUpdate = S["SettingsUpdate"];

export const getSettings = () => request<Settings>("/settings");

export const updateSettings = (body: SettingsUpdate) => request<Settings>("/settings", { method: "PATCH", body });
