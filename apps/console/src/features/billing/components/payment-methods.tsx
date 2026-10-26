"use client";

import { CreditCard, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { useConsole } from "@/providers/console-provider";

/** Our code never sees card numbers: cards will be added through Stripe's hosted form once billing is connected. */
const stripeNote = "Cards are added through Stripe’s secure form once billing is connected.";

export function PaymentMethods() {
  const { paymentMethods } = useConsole();

  return (
    <div>
      <SectionHeader
        title="Payment methods"
        action={
          <Button variant="outline" size="sm" disabled aria-describedby="card-note">
            <Plus /> Add card
          </Button>
        }
      />
      {paymentMethods.length ? (
        <>
          <ul className="space-y-2">
            {paymentMethods.map((m, i) => (
              <li key={m.id} className="flex items-center gap-3 surface px-4 py-3">
                <span className="grid h-8 w-12 place-items-center rounded-md bg-gradient-to-br from-white/15 to-white/5 font-mono text-[11px] font-semibold">
                  {m.brand.slice(0, 4).toUpperCase()}
                </span>
                <span className="flex-1 text-[14px]">
                  {m.brand} •••• {m.last4}
                  <span className="block text-[12px] text-subtle">Expires {m.expiry}</span>
                </span>
                {i === 0 && <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[12px] text-muted">Default</span>}
              </li>
            ))}
          </ul>
          <p id="card-note" className="mt-2.5 text-[12.5px] text-subtle">
            {stripeNote}
          </p>
        </>
      ) : (
        <div id="card-note">
          <EmptyState icon={<CreditCard />} title="No payment methods" description={stripeNote} />
        </div>
      )}
    </div>
  );
}
