"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { App } from "@modelvend/admin-api/apps";
import { keys } from "@/lib/query-keys";

/** Puts an app a change returned in the cache; the list's figures and the audit log load again. */
export function useApplyApp() {
  const queryClient = useQueryClient();
  return useCallback(
    (app: App) => {
      queryClient.setQueryData(keys.app(app.slug), app);
      void queryClient.invalidateQueries({ queryKey: keys.appList });
      void queryClient.invalidateQueries({ queryKey: keys.audit });
    },
    [queryClient],
  );
}

/** Loads an app again after a failed change, so the operator is left looking at current data. */
export function useRefreshApp() {
  const queryClient = useQueryClient();
  return useCallback((slug: string) => void queryClient.invalidateQueries({ queryKey: keys.app(slug) }), [queryClient]);
}
