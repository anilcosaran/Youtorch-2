"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { CodeBlock } from "@/components/code/code-block";
import { snippetsFor } from "@/components/code/snippets";
import { site } from "@/config/site";
import { modelId } from "@/lib/model";
import { statsFor } from "@/mocks/model-stats";
import type { Model } from "@/types/model";
import { apiExample } from "../../lib/api";
import { Playground } from "../playground/playground";
import { DetailSection } from "./detail-section";
import { ModelAbout } from "./model-about";
import { ModelHeader } from "./model-header";
import { ModelStats } from "./model-stats";
import { ModelTabs } from "./model-tabs";
import { PerformancePanel } from "./performance-panel";
import { PricingTable } from "./pricing-table";
import { ProvidersTable } from "./providers-table";
import { defaultTab, modelTabs, type ModelTabId } from "./tabs";
import { UptimePanel } from "./uptime-panel";
import { useModelTab } from "./use-model-tab";

export function ModelDetail({ model }: { model: Model }) {
  const stats = useMemo(() => statsFor(model), [model]);
  const searchParams = useSearchParams();
  const [requested, selectTab] = useModelTab();
  // White-label models have no Providers tab; a link to it lands on the default tab instead.
  const tabs = modelTabs.filter((t) => t.id !== "providers" || stats.providers.length > 0);
  const tab = tabs.some((t) => t.id === requested) ? requested : defaultTab;
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
      <ModelAbout model={model} />
      <ModelStats model={model} stats={stats} />

      <div ref={anchorRef} className="mt-10 scroll-mt-14 lg:scroll-mt-0" />
      <ModelTabs tabs={tabs} active={tab} onSelect={(id) => open(id)} />

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
            description={`${stats.providers.length === 1 ? "One provider serves" : `${stats.providers.length} providers serve`} ${model.name}. You pay the same price whichever one runs your task, and if a provider turns a job down before starting it, ${site.name} tries the next one.`}
          >
            <ProvidersTable providers={stats.providers} />
          </DetailSection>
        )}

        {tab === "pricing" && (
          <DetailSection
            id="pricing"
            description={`Output is billed per ${model.unit}${model.unitDetail ? ` at ${model.unitDetail}` : ""}${model.inputPrice ? `, reference input per ${model.inputPrice.unit}` : ""}. Higher tiers cost more per unit, and failed tasks are never charged.`}
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
            description={`Daily availability over the last ${stats.uptime.length} days${stats.providers.length ? ", overall and per provider" : ""}.`}
          >
            <UptimePanel stats={stats} />
          </DetailSection>
        )}

        {tab === "api" && (
          <DetailSection
            id="api"
            description={`Every model runs as a task: POST /v1/tasks with the model ID and an input that follows its schema (GET /v1/models/${modelId(model)} returns it).`}
          >
            <CodeBlock snippets={snippetsFor(modelId(model), apiExample(model))} title="POST /v1/tasks" />
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
