import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { AppCatalog } from "@/features/apps/components/app-catalog";

export const metadata: Metadata = { title: "Apps" };

export default function AppsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Apps"
        description="Ready-made tools that do one job each. Drop in a file, get the result, and pay a fixed price per run."
      />
      <AppCatalog />
    </>
  );
}
