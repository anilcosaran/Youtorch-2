import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ModelCatalog } from "@/features/models/components/model-catalog";
import { models } from "@/mocks/models";

export const metadata: Metadata = { title: "Model library" };

export default function ModelsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Model library"
        description={`${models.length} production models for video, image, audio and 3D behind one endpoint and one bill.`}
      />
      <ModelCatalog />
    </>
  );
}
