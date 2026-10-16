"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { keys } from "@/lib/api/keys";
import { listProviders } from "@/lib/api/providers";
import { usePermissions } from "@/lib/session";

/**
 * Providers by ID, for operators who may see them. Requests name providers
 * by ID; without access (or until the list loads) the ID stands in.
 */
export function useProviders() {
  const can = usePermissions();
  const providers = useQuery({
    queryKey: keys.providers,
    queryFn: listProviders,
    enabled: can.viewProviders,
    staleTime: 60_000,
    meta: { silent: true },
  });
  const list = providers.data;
  const nameOf = useCallback(
    (id: string) => list?.find((provider) => provider.id === id)?.name ?? id,
    [list],
  );
  return { list, nameOf };
}
