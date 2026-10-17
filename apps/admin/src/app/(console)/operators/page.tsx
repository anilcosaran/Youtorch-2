import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { OperatorsView } from "@/features/operators/operators-view";

export const metadata: Metadata = { title: "Operators" };

export default function Page() {
  return (
    <RequireAccess page="/operators">
      <Suspense>
        <OperatorsView />
      </Suspense>
    </RequireAccess>
  );
}
