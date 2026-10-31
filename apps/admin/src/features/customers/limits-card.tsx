"use client";

import { SlidersHorizontal } from "lucide-react";
import { LIMIT_NAMES, type Customer } from "@modelvend/admin-api/customers";
import { InfoTip } from "@/components/shared/info-tip";
import { Pill } from "@/components/shared/pill";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/use-settings";
import { formatLimit, LIMIT_DESCRIPTIONS, LIMIT_LABELS } from "./limits";

/** The limits in force, and which of them are the workspace's own. */
export function LimitsCard({ customer, onEdit }: { customer: Customer; onEdit?: () => void }) {
  const { limits: defaults } = useSettings();
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Limits</h2>
        {onEdit && (
          <Button variant="ghost" size="xs" onClick={onEdit} className="ml-auto text-muted-foreground">
            <SlidersHorizontal /> Edit
          </Button>
        )}
      </header>
      <dl className="px-4">
        {LIMIT_NAMES.map((name) => {
          const own = customer.overrides.includes(name);
          return (
            <div key={name} className="flex items-start gap-3 border-b py-3 last:border-b-0">
              <dt className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground">
                <span className="truncate">{LIMIT_LABELS[name]}</span>
                <InfoTip label={LIMIT_LABELS[name]}>{LIMIT_DESCRIPTIONS[name]}</InfoTip>
              </dt>
              <dd className="flex flex-col items-end gap-0.5 text-right">
                <span className="text-sm font-medium tabular">{formatLimit(name, customer.limits[name])}</span>
                {own ? (
                  <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                    <Pill tone="warning" className="h-5 px-2">
                      Its own
                    </Pill>
                    {defaults && `Default: ${formatLimit(name, defaults[name])}`}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Platform default</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
