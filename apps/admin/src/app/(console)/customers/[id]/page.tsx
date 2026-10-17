import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { CustomerDetail } from "@/features/customers/customer-detail";

export const metadata: Metadata = { title: "Customer" };

async function Detail({ params }: Pick<PageProps<"/customers/[id]">, "params">) {
  const { id } = await params;
  return <CustomerDetail key={id} id={id} />;
}

export default function Page({ params }: PageProps<"/customers/[id]">) {
  return (
    <RequireAccess page="/customers">
      <Suspense>
        <Detail params={params} />
      </Suspense>
    </RequireAccess>
  );
}
