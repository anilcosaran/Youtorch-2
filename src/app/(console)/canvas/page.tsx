import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeader } from "@/components/ui/section-header";
import { EarlyAccessButton } from "@/features/canvas/components/early-access-button";
import { FlowBoard } from "@/features/canvas/components/flow-board";
import { TemplateGrid } from "@/features/canvas/components/template-grid";
import { teaserFlow } from "@/mocks/canvas";

export const metadata: Metadata = { title: "Canvas" };

export default function CanvasPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title={
          <span className="inline-flex items-center gap-3">
            Canvas <Badge tone="iris">Early access</Badge>
          </span>
        }
        description="Chain any models from the library on one board: a brief becomes a packshot, the packshot becomes a spot, the spot gets a voice. Ship the flow as a single endpoint, billed per step on your balance."
        actions={<EarlyAccessButton />}
      />
      <FlowBoard flow={teaserFlow} />
      <section className="mt-10">
        <SectionHeader title="Start from a template" description="Each one is a ready flow you can swap models in and out of." />
        <TemplateGrid />
      </section>
    </>
  );
}
