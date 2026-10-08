import { ChevronRight } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { ChartLegend } from "@/components/charts/chart-legend";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { modalityColors, modalityLabel, modalityOrder } from "@/lib/modality";
import type { Modality } from "@/types/model";
import type { DailyUsage } from "@/types/usage";

export function ModalityBreakdown({
  series,
  scope,
  onScope,
  spendFor,
  requestsFor,
}: {
  series: DailyUsage[];
  scope: "all" | Modality;
  onScope: (modality: Modality) => void;
  spendFor: (day: DailyUsage, modality: Modality) => number;
  requestsFor: (day: DailyUsage, modality: Modality) => number;
}) {
  return (
    <section className="mt-10">
      <SectionHeader title="By modality" description="Daily spend for each part of the model library." />
      <div className="grid gap-3 md:grid-cols-2">
        {modalityOrder.map((m) => {
          const requests = series.reduce((s, d) => s + requestsFor(d, m), 0);
          const spend = series.reduce((s, d) => s + spendFor(d, m), 0);
          return (
            <div key={m} className={cn("surface p-4 transition", scope !== "all" && scope !== m && "opacity-40")}>
              <button onClick={() => onScope(m)} className="flex items-center gap-1 text-[15px] font-semibold hover:text-muted">
                {modalityLabel[m]} <ChevronRight className="size-4" />
              </button>
              <div className="mt-1.5">
                <ChartLegend
                  items={[
                    { label: "requests", color: modalityColors[m], value: requests.toLocaleString("en-US") },
                    { label: "spend", color: "color-mix(in oklab, var(--color-white) 50%, transparent)", value: formatUsd(spend) },
                  ]}
                />
              </div>
              <BarChart
                height={120}
                accent={modalityColors[m]}
                data={series.map((d) => ({
                  label: d.label,
                  tooltip: d.date,
                  segments: [{ key: m, label: modalityLabel[m], value: spendFor(d, m), color: modalityColors[m] }],
                }))}
                className="mt-2"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
