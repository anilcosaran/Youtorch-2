"use client";

import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@modelvend/admin-api/settings";
import { keys } from "./query-keys";

/** The minimum margin to warn at while the settings load. */
const LOADING_MIN_MARGIN = 0.2;

/** Platform settings, which rarely change. A failed load stays quiet: the screens fall back, and the server enforces them. */
export function useSettings() {
  const settings = useQuery({
    queryKey: keys.settings,
    queryFn: getSettings,
    staleTime: 10 * 60_000,
    meta: { silent: true },
  });
  return {
    settings: settings.data,
    minMargin: settings.data?.minMargin ?? LOADING_MIN_MARGIN,
    /** Undefined until they have loaded. */
    limits: settings.data?.limits,
    failed: settings.isError,
  };
}
