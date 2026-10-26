import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { mediumMeta } from "@/lib/modality";
import { discounted, promoLabel } from "@/lib/pricing";
import type { Medium, Model, ModelStats as Stats } from "@/types/model";
import { uptimeTone } from "../../lib/endpoints";

export function ModelStats({ model, stats }: { model: Model; stats: Stats }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-2.5 @2xl:grid-cols-3 @4xl:grid-cols-5">
      <Stat label={model.inputPrice ? "In / out price" : "Price"} aside={promoLabel(model) ?? undefined}>
        <PriceLine model={model} />
      </Stat>
      <Stat label="Max output">{model.maxOutput}</Stat>
      <Stat label="P50 latency">{model.latency.replace("~", "")}</Stat>
      <Stat label="Uptime">
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", uptimeTone(stats.uptimePct))} />
          {stats.uptimePct.toFixed(2)}%
        </span>
      </Stat>
      <Stat label="Modalities">
        <span className="flex items-center gap-1.5">
          {model.inputs.map((m) => (
            <MediumChip key={m} medium={m} />
          ))}
          <ArrowRight className="mx-0.5 size-3.5 text-muted" />
          {model.outputs.map((m) => (
            <MediumChip key={m} medium={m} />
          ))}
        </span>
      </Stat>
    </dl>
  );
}

function Stat({ label, aside, children }: { label: string; aside?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface/40 px-3.5 py-2.5">
      <dt className="flex items-center justify-between gap-2">
        <span className="truncate eyebrow">{label}</span>
        {aside && <span className="shrink-0 text-[12px] font-medium text-deal">{aside}</span>}
      </dt>
      <dd className="mt-1 truncate text-[15px] font-medium text-fg tabular">{children}</dd>
    </div>
  );
}

function PriceLine({ model }: { model: Model }) {
  const input = model.inputPrice;
  return (
    <span title={model.unitDetail ? `Billed at ${model.unitDetail}` : undefined}>
      {input && (
        <>
          {formatPrice(discounted(model, input.price))}
          {input.unit !== model.unit && <span className="text-[13px] text-muted"> per {input.unit}</span>}
          <span className="text-muted"> / </span>
        </>
      )}
      {formatPrice(discounted(model))}
      <span className="text-[13px] text-muted"> per {model.unit}</span>
    </span>
  );
}

function MediumChip({ medium }: { medium: Medium }) {
  const { label, icon: Icon } = mediumMeta[medium];
  return (
    <span title={label} className="grid size-[22px] place-items-center rounded-md bg-white/[0.09] text-fg ring-1 ring-white/10">
      <Icon className="size-3.5" aria-label={label} />
    </span>
  );
}
