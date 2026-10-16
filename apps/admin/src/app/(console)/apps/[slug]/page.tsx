import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { AppDetail } from "@/features/apps/app-detail";

export const metadata: Metadata = { title: "App" };

async function Detail({ params }: Pick<PageProps<"/apps/[slug]">, "params">) {
  const { slug } = await params;
  return <AppDetail key={slug} slug={slug} />;
}

export default function Page({ params }: PageProps<"/apps/[slug]">) {
  return (
    <RequireAccess page="/apps">
      <Suspense>
        <Detail params={params} />
      </Suspense>
    </RequireAccess>
  );
}
