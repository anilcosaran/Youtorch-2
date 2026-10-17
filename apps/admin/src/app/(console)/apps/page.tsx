import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { AppsView } from "@/features/apps/apps-view";

export const metadata: Metadata = { title: "Apps" };

export default function Page() {
  return (
    <RequireAccess page="/apps">
      <Suspense>
        <AppsView />
      </Suspense>
    </RequireAccess>
  );
}
