import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { AuditView } from "@/features/audit/audit-view";

export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return (
    <RequireAccess page="/audit">
      <Suspense>
        <AuditView />
      </Suspense>
    </RequireAccess>
  );
}
