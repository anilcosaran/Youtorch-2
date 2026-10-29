import { SlidersHorizontal } from "lucide-react";
import { TIER_LIMITS, type Customer } from "@modelvend/admin-api/customers";
import { InfoTip } from "@/components/shared/info-tip";
import { Pill } from "@/components/shared/pill";
import { Button } from "@/components/ui/button";
import { TIER_LABELS } from "@/lib/labels";
import { formatLimit, LIMIT_DESCRIPTIONS, LIMIT_KEYS, LIMIT_LABELS } from "./limits";

/** The limits in force, and which of them the workspace overrides. */
export function LimitsCard({ customer, onEdit }: { customer: Customer; onEdit?: () => void }) {
  const defaults = TIER_LIMITS[customer.tier];
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Limits</h2>
        <Pill tone="info" className="h-5 px-2">
          {TIER_LABELS[customer.tier]} tier
        </Pill>
        {onEdit && (
          <Button variant="ghost" size="xs" onClick={onEdit} className="ml-auto text-muted-foreground">
            <SlidersHorizontal /> Edit
          </Button>
        )}
      </header>
      <dl className="px-4">
        {LIMIT_KEYS.map((key) => {
          const overridden = customer.overrides.includes(key);
          return (
            <div key={key} className="flex items-start gap-3 border-b py-3 last:border-b-0">
              <dt className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-muted-foreground">
                <span className="truncate">{LIMIT_LABELS[key]}</span>
                <InfoTip label={LIMIT_LABELS[key]}>{LIMIT_DESCRIPTIONS[key]}</InfoTip>
              </dt>
              <dd className="flex flex-col items-end gap-0.5 text-right">
                <span className="text-sm font-medium tabular">{formatLimit(key, customer.limits[key])}</span>
                {overridden ? (
                  <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
                    <Pill tone="warning" className="h-5 px-2">
                      Override
                    </Pill>
                    Tier default: {formatLimit(key, defaults[key])}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Tier default</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
