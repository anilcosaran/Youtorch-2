"use client";

import { useState } from "react";
import { SectionHeader, SectionLink } from "@/components/ui/section-header";
import { Segmented } from "@/components/ui/segmented";
import { ModelCard } from "@/features/models/components/model-card";
import { modalityLabel, modalityOrder } from "@/lib/modality";
import { models } from "@/mocks/models";
import type { Modality } from "@/types/model";

const filters = [{ value: "all", label: "All" } as const, ...modalityOrder.map((m) => ({ value: m, label: modalityLabel[m] }))];

export function ModelShowcase() {
  const [filter, setFilter] = useState<"all" | Modality>("all");
  const visible = models.filter((m) => filter === "all" || m.modality === filter).slice(0, 8);

  return (
    <section>
      <SectionHeader
        title="Model library"
        description={`${models.length} production models behind one endpoint and one bill.`}
        action={
          <div className="flex items-center gap-3">
            <Segmented value={filter} onChange={setFilter} options={filters} className="hidden md:inline-flex" />
            <SectionLink href="/models">View all</SectionLink>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visible.map((model, i) => (
          <ModelCard key={model.slug} model={model} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }} />
        ))}
      </div>
    </section>
  );
}
