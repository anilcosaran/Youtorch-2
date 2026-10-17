"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@modelvend/admin-api/client";
import { toastError } from "./notify";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A 4xx will not change on its own; network and server errors get two more tries.
        retry: (count, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
    queryCache: new QueryCache({
      // First loads render their own error state; failed background refreshes toast,
      // except for quiet background figures such as a badge (`meta.silent`).
      onError: (error, query) => {
        if (query.state.data !== undefined && !query.meta?.silent) toastError(error);
      },
    }),
  });
}

let browserClient: QueryClient | undefined;

function getClient() {
  // Keep server renders isolated and the browser cache across renders.
  if (typeof window === "undefined") return makeClient();
  browserClient ??= makeClient();
  return browserClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getClient()}>{children}</QueryClientProvider>;
}
