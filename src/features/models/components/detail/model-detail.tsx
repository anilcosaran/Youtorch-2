"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { CodeBlock } from "@/components/code/code-block";
import { snippetsFor } from "@/components/code/snippets";
import { SidePanel } from "@/components/layout/side-panel";
import { site } from "@/config/site";
import { statsFor } from "@/mocks/model-stats";
import type { Model } from "@/types/model";
import { PlaygroundPanel } from "../playground/playground-panel";
import { DetailSection } from "./detail-section";
import { ModelAbout } from "./model-about";
import { ModelHeader } from "./model-header";
import { ModelStats } from "./model-stats";
import { PerformancePanel } from "./performance-panel";
import { PricingTable } from "./pricing-table";
import { ProvidersTable } from "./providers-table";
import { SectionNav } from "./section-nav";
import { detailSections } from "./sections";
import { UptimePanel } from "./uptime-panel";
import { useScrollSpy } from "./use-scroll-spy";

const sectionIds = detailSections.map((s) => s.id);

export function ModelDetail({ model }: { model: Model }) {
  const stats = useMemo(() => statsFor(model), [model]);
  const searchParams = useSearchParams();
  const [playground, setPlayground] = useState(() => searchParams.has("playground"));
  const { active, jump } = useScrollSpy(sectionIds);
  const togglePlayground = () => setPlayground((o) => !o);

  return (
    <>
      <div className="@container min-w-0">
        <ModelHeader model={model} playgroundOpen={playground} onTogglePlayground={togglePlayground} />
        <ModelAbout model={model} endpoints={stats.endpoints.length} />
        <ModelStats model={model} stats={stats} />

        <div className="mt-8 grid gap-10 border-t border-line pt-8 @3xl:grid-cols-[44px_minmax(0,1fr)] @3xl:gap-6 @5xl:grid-cols-[190px_minmax(0,1fr)] @5xl:gap-10">
          <SectionNav active={active} onJump={jump} playgroundOpen={playground} onTogglePlayground={togglePlayground} />

          <div className="min-w-0 space-y-14">
            <DetailSection
              id="providers"
              description={`${stats.endpoints.length} endpoints serve ${model.name}. ${site.name} routes each request by the mode you pick and fails over automatically when an endpoint degrades.`}
            >
              <ProvidersTable model={model} endpoints={stats.endpoints} />
            </DetailSection>

            <DetailSection
              id="pricing"
              description={`Output is billed per ${model.unit}${model.unitDetail ? ` at ${model.unitDetail}` : ""}${model.inputPrice ? `, reference input per ${model.inputPrice.unit}` : ""}. Higher tiers cost more per unit, and failed generations are never charged.`}
            >
              <PricingTable model={model} />
            </DetailSection>

            <DetailSection id="performance" description="Median time from request to finished asset, last 30 days.">
              <PerformancePanel latency={stats.latency} />
            </DetailSection>

            <DetailSection
              id="uptime"
              description={`Daily availability per endpoint over the last ${stats.uptime.length} days. Routed traffic only counts as down when every fallback failed.`}
            >
              <UptimePanel stats={stats} />
            </DetailSection>

            <DetailSection id="api" description="One endpoint for every model. Swap the model field to switch providers.">
              <CodeBlock snippets={snippetsFor(model.slug)} title="POST /v1/generations" />
              <ul className="mt-4 flex flex-wrap gap-2">
                {model.capabilities.map((c) => (
                  <li key={c} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[13px] text-muted">
                    <Check className="size-3.5 text-jade-400" /> {c}
                  </li>
                ))}
              </ul>
            </DetailSection>
          </div>
        </div>
      </div>

      <SidePanel open={playground}>
        <PlaygroundPanel model={model} initialPrompt={searchParams.get("prompt") ?? ""} onClose={() => setPlayground(false)} />
      </SidePanel>
    </>
  );
}
