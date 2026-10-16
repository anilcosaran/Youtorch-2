import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { RequestsView } from "@/features/requests/requests-view";

export const metadata: Metadata = { title: "Requests" };

export default function Page() {
  return (
    <RequireAccess page="/requests">
      <Suspense>
        <RequestsView />
      </Suspense>
    </RequireAccess>
  );
}
