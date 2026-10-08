import { chartAccent } from "@/components/charts/constants";
import { site } from "@/config/site";
import { formatCompact, formatUsd } from "@/lib/format";
import { modalityColors, modalityLabel } from "@/lib/modality";
import { monthlyBudget } from "@/mocks/usage";
import type { Modality } from "@/types/model";

export function BudgetCard({ spent, budget = monthlyBudget }: { spent: number; budget?: number }) {
  return (
    <section className="surface p-4">
      <p className="eyebrow">October budget</p>
      <div className="mt-3 flex items-baseline justify-between text-[14px]">
        <span className="font-medium">{site.workspace.name}</span>
        <span className="text-muted tabular">
          <span className="text-fg">{formatUsd(spent)}</span> / {formatUsd(budget)}
        </span>
      </div>
      <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.min(100, (spent / budget) * 100)}%`, background: chartAccent }}
        />
      </div>
    </section>
  );
}

export function ModalityMixCard({ mix }: { mix: { modality: Modality; value: number }[] }) {
  const total = mix.reduce((s, x) => s + x.value, 0);
  return (
    <section className="surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Spend by modality</p>
        <span className="text-[13px] text-fg tabular">{formatUsd(total)}</span>
      </div>
      <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-white/[0.06]">
        {total > 0 &&
          mix.map(({ modality, value }) => (
            <span
              key={modality}
              className="h-full transition-[width] duration-700"
              style={{ width: `${(value / total) * 100}%`, background: modalityColors[modality] }}
            />
          ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-[13px]">
        {mix.map(({ modality, value }) => (
          <li key={modality} className="flex items-center gap-2">
            <span className="size-2 rounded-[2px]" style={{ background: modalityColors[modality] }} />
            <span className="text-muted">{modalityLabel[modality]}</span>
            <span className="ml-auto text-fg tabular">{formatUsd(value)}</span>
            <span className="w-10 text-right text-subtle tabular">{total > 0 ? `${Math.round((value / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TopKeysCard({ keys }: { keys: { name: string; requests: number }[] }) {
  return (
    <section className="surface p-4">
      <p className="mb-3 eyebrow">Top API keys</p>
      {keys.length ? (
        <ul className="space-y-1">
          {keys.map((k) => (
            <li key={k.name} className="flex items-center justify-between rounded-md bg-white/[0.04] px-2.5 py-2 text-[13px]">
              <span className="truncate font-medium">{k.name}</span>
              <span className="text-muted tabular">{formatCompact(k.requests)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-subtle">Requests per key will be listed here.</p>
      )}
    </section>
  );
}
