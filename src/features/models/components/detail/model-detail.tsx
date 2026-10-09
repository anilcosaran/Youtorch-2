"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { CodeBlock } from "@/components/code/code-block";
import { snippetsFor } from "@/components/code/snippets";
import { site } from "@/config/site";
import { statsFor } from "@/mocks/model-stats";
import type { Model } from "@/types/model";
import { Playground } from "../playground/playground";
import { DetailSection } from "./detail-section";
import { ModelAbout } from "./model-about";
import { ModelHeader } from "./model-header";
import { ModelStats } from "./model-stats";
import { ModelTabs } from "./model-tabs";
import { PerformancePanel } from "./performance-panel";
import { PricingTable } from "./pricing-table";
import { ProvidersTable } from "./providers-table";
import type { ModelTabId } from "./tabs";
import { UptimePanel } from "./uptime-panel";
import { useModelTab } from "./use-model-tab";

export function ModelDetail({ model }: { model: Model }) {
  const stats = useMemo(() => statsFor(model), [model]);
  const searchParams = useSearchParams();
  const [tab, selectTab] = useModelTab();
  const [focusRequest, setFocusRequest] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);

  /**
   * Switches tabs. When the tab bar is stuck to the top the new panel jumps to its start without animating,
   * so the bar stays put; header buttons (`reveal`) smoothly bring the tabs into view instead.
   */
  const open = (id: ModelTabId, reveal = false) => {
    selectTab(id);
    const anchor = anchorRef.current;
    if (!anchor) return;
    const offset = parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0;
    const top = anchor.getBoundingClientRect().top;
    if (top < offset - 1) anchor.scrollIntoView({ behavior: "instant", block: "start" });
    else if (reveal && top > window.innerHeight * 0.6) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="@container min-w-0">
      <ModelHeader
        model={model}
        onTry={() => {
          open("playground", true);
          setFocusRequest((n) => n + 1);
        }}
        onApi={() => open("api", true)}
      />
      <ModelAbout model={model} endpoints={stats.endpoints.length} />
      <ModelStats model={model} stats={stats} />

      <div ref={anchorRef} className="mt-10 scroll-mt-14 lg:scroll-mt-0" />
      <ModelTabs active={tab} onSelect={(id) => open(id)} />

      {/* At least a viewport tall so short tabs don't shrink the page and yank the scroll position. */}
      <div className="min-h-[calc(100dvh-3rem)] pt-8">
        <Playground
          key={model.slug}
          model={model}
          initialPrompt={searchParams.get("prompt") ?? ""}
          hidden={tab !== "playground"}
          focusRequest={focusRequest}
        />

        {tab === "providers" && (
          <DetailSection
            id="providers"
            description={`${stats.endpoints.length} endpoints serve ${model.name}. ${site.name} routes each request by the mode you pick and fails over automatically when an endpoint degrades.`}
          >
            <ProvidersTable model={model} endpoints={stats.endpoints} />
          </DetailSection>
        )}

        {tab === "pricing" && (
          <DetailSection
            id="pricing"
            description={`Output is billed per ${model.unit}${model.unitDetail ? ` at ${model.unitDetail}` : ""}${model.inputPrice ? `, reference input per ${model.inputPrice.unit}` : ""}. Higher tiers cost more per unit, and failed generations are never charged.`}
          >
            <PricingTable model={model} />
          </DetailSection>
        )}

        {tab === "performance" && (
          <DetailSection id="performance" description="Median time from request to finished asset, last 30 days.">
            <PerformancePanel latency={stats.latency} />
          </DetailSection>
        )}

        {tab === "uptime" && (
          <DetailSection
            id="uptime"
            description={`Daily availability per endpoint over the last ${stats.uptime.length} days. Routed traffic only counts as down when every fallback failed.`}
          >
            <UptimePanel stats={stats} />
          </DetailSection>
        )}

        {tab === "api" && (
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
        )}
      </div>
    </div>
  );
}
