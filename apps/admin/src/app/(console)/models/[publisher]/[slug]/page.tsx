import type { Metadata } from "next";
import { Suspense } from "react";
import { RequireAccess } from "@/components/layout/require-access";
import { ModelDetail } from "@/features/models/model-detail";

export const metadata: Metadata = { title: "Model" };

async function Detail({ params }: Pick<PageProps<"/models/[publisher]/[slug]">, "params">) {
  const { publisher, slug } = await params;
  const id = `${decodeURIComponent(publisher)}/${decodeURIComponent(slug)}`;
  return <ModelDetail key={id} id={id} />;
}

export default function Page({ params }: PageProps<"/models/[publisher]/[slug]">) {
  return (
    <RequireAccess page="/models">
      <Suspense>
        <Detail params={params} />
      </Suspense>
    </RequireAccess>
  );
}
