import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppStudio } from "@/features/apps/components/app-studio";
import { apps, findApp } from "@/mocks/apps";

export function generateStaticParams() {
  return apps.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/apps/[slug]">): Promise<Metadata> {
  const app = findApp((await params).slug);
  return app ? { title: app.name, description: app.description } : { title: "App not found" };
}

export default async function AppPage({ params }: PageProps<"/apps/[slug]">) {
  const app = findApp((await params).slug);
  if (!app) notFound();
  return <AppStudio app={app} />;
}
