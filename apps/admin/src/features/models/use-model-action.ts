"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { keys } from "@/lib/api/keys";
import type { Model } from "@/lib/api/models";
import { toastError } from "@/lib/notify";

/**
 * Puts a model a change returned in the cache. Lists, provider route counts
 * and the overview show figures derived from it, so they load again.
 */
export function useApplyModel() {
  const queryClient = useQueryClient();
  return useCallback(
    (model: Model) => {
      queryClient.setQueryData(keys.model(model.id), model);
      void queryClient.invalidateQueries({ queryKey: ["models", "list"] });
      void queryClient.invalidateQueries({ queryKey: keys.providers });
      void queryClient.invalidateQueries({ queryKey: keys.overviewAll });
    },
    [queryClient],
  );
}

/** Runs a change that returns the model, then toasts how it went. Resolves to the model, or null when it failed. */
export function useModelAction() {
  const apply = useApplyModel();
  return useCallback(
    async (run: () => Promise<Model>, success: string, failure: string): Promise<Model | null> => {
      try {
        const model = await run();
        apply(model);
        toast.success(success);
        return model;
      } catch (error) {
        toastError(error, failure);
        return null;
      }
    },
    [apply],
  );
}
