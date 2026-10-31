"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type { Model } from "@modelvend/admin-api/models";
import { toastError } from "@/lib/notify";
import { keys } from "@/lib/query-keys";

/**
 * Puts a model a change returned in the cache. Lists, provider route counts
 * and the overview show figures derived from it, and the change is in the
 * audit log, so they load again.
 */
export function useApplyModel() {
  const queryClient = useQueryClient();
  return useCallback(
    (model: Model) => {
      queryClient.setQueryData(keys.model(model.id), model);
      void queryClient.invalidateQueries({ queryKey: ["models", "list"] });
      void queryClient.invalidateQueries({ queryKey: keys.providers });
      void queryClient.invalidateQueries({ queryKey: keys.overviewAll });
      void queryClient.invalidateQueries({ queryKey: keys.audit });
    },
    [queryClient],
  );
}

/** Loads a model again after a failed change, so a 409 `stale` leaves the operator looking at current data. */
export function useRefreshModel() {
  const queryClient = useQueryClient();
  return useCallback((id: string) => void queryClient.invalidateQueries({ queryKey: keys.model(id) }), [queryClient]);
}

/**
 * Runs a change to the model that returns it, then toasts how it went. Resolves to the model, or null when it
 * failed, in which case the model loads again.
 */
export function useModelAction(id: string) {
  const apply = useApplyModel();
  const refresh = useRefreshModel();
  return useCallback(
    async (run: () => Promise<Model>, success: string, failure: string): Promise<Model | null> => {
      try {
        const model = await run();
        apply(model);
        toast.success(success);
        return model;
      } catch (error) {
        toastError(error, failure);
        refresh(id);
        return null;
      }
    },
    [apply, refresh, id],
  );
}
