"use client";

import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { topUpPresets } from "@/mocks/workspace";
import { useConsole } from "@/providers/console-provider";

export function BonusLadder() {
  const { openDialog } = useConsole();
  return (
    <section className="surface p-5 lg:col-span-4">
      <p className="text-[14px] font-medium">Top-up bonus ladder</p>
      <p className="mt-0.5 text-[13px] text-subtle">Larger top-ups earn extra credits automatically.</p>
      <ol className="mt-4 space-y-1.5">
        {topUpPresets.map((p) => (
          <li key={p.amount}>
            <button
              onClick={() => openDialog("add-funds")}
              className="flex w-full items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[14px] transition hover:bg-white/[0.08]"
            >
              <span className="tabular">{formatUsd(p.amount)}+</span>
              <span className={cn("font-mono text-[13px]", p.bonus ? "text-ember-300" : "text-subtle")}>
                {p.bonus ? `+${p.bonus * 100}% credits` : "standard"}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
