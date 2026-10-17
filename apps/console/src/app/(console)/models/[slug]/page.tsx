import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelDetail } from "@/features/models/components/detail/model-detail";
import { ModelDetailSkeleton } from "@/features/models/components/detail/model-detail-skeleton";
import { findModel, models } from "@/mocks/models";

// The slug is read outside Suspense on purpose (see below), so navigations here block instead of streaming.
export const instant = false;

export function generateStaticParams() {
  return models.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({ params }: PageProps<"/models/[slug]">): Promise<Metadata> {
  const model = findModel((await params).slug);
  return model ? { title: model.name, description: model.description } : { title: "Model not found" };
}

export default async function ModelPage({ params }: PageProps<"/models/[slug]">) {
  // Resolve before the Suspense boundary so unknown slugs get a real 404 status instead of a streamed one.
  const model = findModel((await params).slug);
  if (!model) notFound();

  return (
    <div className="mx-auto max-w-[1280px]">
      <Suspense fallback={<ModelDetailSkeleton />}>
        <ModelDetail model={model} />
      </Suspense>
    </div>
  );
}
