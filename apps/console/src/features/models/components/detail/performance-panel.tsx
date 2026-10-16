import { BarChart } from "@/components/charts/bar-chart";
import type { ModelStats } from "@/types/model";
import { DetailPanel } from "./detail-section";

export function PerformancePanel({ latency }: { latency: ModelStats["latency"] }) {
  const average = latency.reduce((s, d) => s + d.value, 0) / latency.length;

  return (
    <DetailPanel>
      <div className="p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-[13px] text-muted">P50 latency</p>
          <p className="text-[13px] text-muted tabular">
            avg <span className="font-medium text-fg">{average.toFixed(1)}s</span>
          </p>
        </div>
        <BarChart
          height={180}
          format={(v) => `${v.toFixed(1)}s`}
          data={latency.map((d) => ({
            label: d.label,
            tooltip: d.date,
            segments: [{ key: "p50", label: "P50 latency", value: d.value, color: "var(--color-iris-400)" }],
          }))}
        />
      </div>
    </DetailPanel>
  );
}
