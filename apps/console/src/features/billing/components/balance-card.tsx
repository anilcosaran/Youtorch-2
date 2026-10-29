"use client";

import { BellRing, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatUsd, splitUsd } from "@/lib/format";
import { useConsole } from "@/providers/console-provider";

/** `month` names the current month, whose spend so far is `monthToDate`. */
export function BalanceCard({ month, monthToDate, budget }: { month: string; monthToDate: number; budget: number }) {
  const { balance, autoReload, openDialog } = useConsole();
  const { whole, cents } = splitUsd(balance);

  return (
    <section className="surface p-6 lg:col-span-8">
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="eyebrow">Credit balance</p>
          <p className="mt-2 text-[60px] leading-none font-semibold tracking-[-0.04em] tabular">
            {whole}
            <span className="text-white/50">.{cents}</span>
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => openDialog("add-funds")}>
              <Plus /> Add credits
            </Button>
            <Button variant="secondary" onClick={() => openDialog("auto-reload")}>
              <RefreshCw />
              Auto reload
              <span className={cn("ml-0.5 text-[12px]", autoReload.enabled ? "text-jade-400" : "text-subtle")}>
                {autoReload.enabled ? "On" : "Off"}
              </span>
            </Button>
          </div>
        </div>

        <div className="min-w-[260px] rounded-lg bg-white/[0.04] p-4">
          <p className="flex items-center gap-1.5 text-[14px] font-medium">
            <BellRing className="size-3.5 text-ember-400" /> {month} budget
          </p>
          <p className="mt-3 text-[14px] tabular">
            <span className="text-fg">{formatUsd(monthToDate)}</span>
            <span className="text-subtle"> of {formatUsd(budget)}</span>
          </p>
          <div className="relative mt-2 h-1.5 rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-iris-400 transition-[width] duration-700"
              style={{ width: `${Math.min(100, (monthToDate / budget) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-[12px] text-subtle">Spend so far this month. Budget alerts by email are coming soon.</p>
        </div>
      </div>
    </section>
  );
}
