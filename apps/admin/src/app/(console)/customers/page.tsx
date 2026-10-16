import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { CustomersView } from "@/features/customers/customers-view";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return (
    <RequireAccess page="/customers">
      <Suspense>
        <CustomersView />
      </Suspense>
    </RequireAccess>
  );
}
