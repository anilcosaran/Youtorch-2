import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { ModelsView } from "@/features/models/models-view";

export const metadata: Metadata = { title: "Models" };

export default function Page() {
  return (
    <RequireAccess page="/models">
      <Suspense>
        <ModelsView />
      </Suspense>
    </RequireAccess>
  );
}
