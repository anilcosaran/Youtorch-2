import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { ApiKeysView } from "@/features/api-keys/api-keys-view";

export const metadata: Metadata = { title: "API keys" };

export default function Page() {
  return (
    <RequireAccess page="/api-keys">
      <Suspense>
        <ApiKeysView />
      </Suspense>
    </RequireAccess>
  );
}
