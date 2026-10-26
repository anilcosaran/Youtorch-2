"use client";

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { modalityIcon, modalityLabel } from "@/lib/modality";
import { madeBy, modelId } from "@/lib/model";
import { discounted } from "@/lib/pricing";
import { models } from "@/mocks/models";
import type { Model, Modality } from "@/types/model";
import { ModelCard } from "./model-card";

type Sort = "featured" | "price" | "speed";

const latencySeconds = (latency: string) => Number(latency.replace(/\D/g, ""));

/** Billing units in catalog order. Prices are only comparable within a unit, so the price sort groups by unit first. */
const unitOrder = [...new Set(models.map((m) => m.unit))];

const byNetPrice = (a: Model, b: Model) =>
  a.unit === b.unit ? discounted(a) - discounted(b) : unitOrder.indexOf(a.unit) - unitOrder.indexOf(b.unit);

export function ModelCatalog() {
  const [query, setQuery] = useState("");
  const [modality, setModality] = useState<"all" | Modality>("all");
  const [sort, setSort] = useState<Sort>("featured");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: models.length };
    for (const m of models) c[m.modality] = (c[m.modality] ?? 0) + 1;
    return c;
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = models.filter(
      (m) =>
        (modality === "all" || m.modality === modality) &&
        (!q || `${m.name} ${modelId(m)} ${madeBy(m)} ${m.description} ${m.capabilities.join(" ")}`.toLowerCase().includes(q)),
    );
    if (sort === "price") return [...list].sort(byNetPrice);
    if (sort === "speed") return [...list].sort((a, b) => latencySeconds(a.latency) - latencySeconds(b.latency));
    return list;
  }, [query, modality, sort]);

  const filters: ("all" | Modality)[] = ["all", "video", "image", "audio", "3d"];

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-8 lg:self-start">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models"
            className="h-9 w-full rounded-[10px] border border-line-strong bg-surface pr-3 pl-9 text-[14px] outline-none placeholder:text-subtle focus:border-ember-400/60"
          />
        </div>
        <div>
          <p className="mb-1.5 px-2 font-mono text-[11px] tracking-[0.16em] text-subtle uppercase">Modality</p>
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {filters.map((f) => {
              const Icon = f === "all" ? null : modalityIcon[f];
              const active = modality === f;
              return (
                <li key={f}>
                  <button
                    onClick={() => setModality(f)}
                    className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[14px] whitespace-nowrap transition ${
                      active ? "bg-white/[0.06] text-fg" : "text-muted hover:bg-white/[0.03] hover:text-fg"
                    }`}
                  >
                    {Icon ? (
                      <Icon className={`size-4 ${active ? "text-ember-400" : "text-subtle"}`} />
                    ) : (
                      <span className="size-4 rounded bg-gradient-to-br from-ember-400 to-iris-400" />
                    )}
                    <span className="flex-1 text-left">{f === "all" ? "All models" : modalityLabel[f]}</span>
                    <span className="font-mono text-[12px] text-subtle tabular">{counts[f] ?? 0}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[14px] text-muted">
            <span className="text-fg">{visible.length}</span> {visible.length === 1 ? "model" : "models"}
          </p>
          <Segmented
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: "featured", label: "Featured" },
              { value: "price", label: "Lowest price" },
              { value: "speed", label: "Fastest" },
            ]}
          />
        </div>
        {visible.length ? (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {visible.map((m, i) => (
              <ModelCard key={m.slug} model={m} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<SearchX />}
            title="No models match"
            description={`Nothing found for “${query}”. Try a model name, maker or capability.`}
          />
        )}
      </div>
    </div>
  );
}
