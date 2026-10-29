"use client";

import { useState } from "react";
import { CreditCard, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { MAX_TOP_UP, MIN_TOP_UP, parseAmount } from "@/lib/money";
import { bonusFor, topUpPresets } from "@/mocks/workspace";
import { useConsole } from "@/providers/console-provider";

export function AddFundsForm({ onDone }: { onDone: () => void }) {
  const { addFunds, paymentMethods } = useConsole();
  const toast = useToast();
  const [input, setInput] = useState("50");
  const parsed = parseAmount(input, { min: MIN_TOP_UP, max: MAX_TOP_UP });
  const amount = parsed.ok ? parsed.value : 0;
  // Shown for the amount that will be charged; the provider computes the real bonus the same way.
  const bonus = parsed.ok ? bonusFor(amount) : 0;
  const card = paymentMethods[0];

  const pay = () => {
    if (!parsed.ok || !card) return;
    const added = addFunds(parsed.value);
    if (added === null) return;
    toast(`${formatUsd(parsed.value + added)} added to your balance`);
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {topUpPresets.map((preset) => (
          <button
            key={preset.amount}
            onClick={() => setInput(String(preset.amount))}
            aria-pressed={parsed.ok && amount === preset.amount}
            className={cn(
              "relative rounded-xl border px-2 py-3 text-center transition",
              parsed.ok && amount === preset.amount
                ? "border-ember-400/70 bg-ember-500/10 shadow-[0_0_0_3px_rgb(255_94_43/0.12)]"
                : "border-line-strong hover:border-white/20",
            )}
          >
            <span className="block text-[16px] font-semibold tabular">${preset.amount}</span>
            <span className={cn("mt-0.5 block text-[11px]", preset.bonus ? "text-ember-300" : "text-subtle")}>
              {preset.bonus ? `+${preset.bonus * 100}% bonus` : "no bonus"}
            </span>
          </button>
        ))}
      </div>

      <Field label="Custom amount">
        <div className="relative">
          <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-subtle">$</span>
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={!parsed.ok}
            aria-describedby="top-up-error"
            className="pl-7 tabular"
          />
        </div>
        {!parsed.ok && (
          <span id="top-up-error" role="alert" className="mt-1.5 block text-[12.5px] text-down">
            {parsed.error}
          </span>
        )}
      </Field>

      <dl className="space-y-1.5 rounded-xl border border-line bg-canvas/40 p-3 text-[14px]">
        <div className="flex justify-between text-muted">
          <dt>Credits</dt>
          <dd className="tabular">{formatUsd(amount)}</dd>
        </div>
        <div className="flex justify-between text-muted">
          <dt>Bonus credits</dt>
          <dd className={cn("tabular", bonus > 0 && "text-jade-400")}>+{formatUsd(bonus)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5 font-medium">
          <dt>Added to balance</dt>
          <dd className="tabular">{formatUsd(amount + bonus)}</dd>
        </div>
      </dl>

      <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[14px] text-muted">
        <CreditCard className="size-4 shrink-0" />
        {card ? `${card.brand} •••• ${card.last4}` : "No card on file. Cards can be added once billing is connected to Stripe."}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="flex items-center gap-1.5 text-[12px] text-subtle">
          <Lock className="size-3" /> Payments are processed by Stripe
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!parsed.ok || !card} onClick={pay}>
            Pay {formatUsd(amount)}
          </Button>
        </div>
      </div>
    </div>
  );
}
