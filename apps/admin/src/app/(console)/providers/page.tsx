import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { ProvidersView } from "@/features/providers/providers-view";

export const metadata: Metadata = { title: "Providers" };

export default function Page() {
  return (
    <RequireAccess page="/providers">
      <Suspense>
        <ProvidersView />
      </Suspense>
    </RequireAccess>
  );
}
