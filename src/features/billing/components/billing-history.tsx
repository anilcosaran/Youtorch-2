"use client";

import { Receipt } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { formatUsd } from "@/lib/format";
import { useConsole } from "@/providers/console-provider";

export function BillingHistory() {
  const { transactions } = useConsole();

  return (
    <div>
      <SectionHeader title="Billing history" />
      {transactions.length ? (
        <div className="divide-y divide-line surface">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
              <Receipt className="size-4 text-subtle" />
              <span className="flex-1">
                {t.label}
                <span className="block font-mono text-[12px] text-subtle">{t.id}</span>
              </span>
              <span className="text-[13px] text-subtle">{t.date}</span>
              <span className="w-24 text-right font-medium tabular">
                {formatUsd(t.amount)}
                {t.bonus > 0 && <span className="block text-[12px] font-normal text-jade-400">+{formatUsd(t.bonus)} bonus</span>}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Receipt />} title="No invoices yet" description="Receipts for every top-up will be listed here." />
      )}
    </div>
  );
}
