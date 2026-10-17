"use client";

import { useState } from "react";
import { CreditCard, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { bonusFor, topUpPresets } from "@/mocks/workspace";
import { useConsole } from "@/providers/console-provider";

const MIN_TOP_UP = 5;

export function AddFundsForm({ onDone }: { onDone: () => void }) {
  const { addFunds, paymentMethods, openDialog } = useConsole();
  const toast = useToast();
  const [amount, setAmount] = useState(50);
  const bonus = +(amount * bonusFor(amount)).toFixed(2);
  const card = paymentMethods[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {topUpPresets.map((preset) => (
          <button
            key={preset.amount}
            onClick={() => setAmount(preset.amount)}
            aria-pressed={amount === preset.amount}
            className={cn(
              "relative rounded-xl border px-2 py-3 text-center transition",
              amount === preset.amount
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
            type="number"
            min={MIN_TOP_UP}
            max={10000}
            value={amount}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
            className="pl-7 tabular"
          />
        </div>
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

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-[14px]">
        <span className="flex items-center gap-2 text-muted">
          <CreditCard className="size-4" />
          {card ? `${card.brand} •••• ${card.last4}` : "No card on file"}
        </span>
        <button onClick={() => openDialog("add-card")} className="text-[13px] font-medium text-ember-300 hover:text-ember-200">
          {card ? "Change" : "Add card"}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="flex items-center gap-1.5 text-[12px] text-subtle">
          <Lock className="size-3" /> Secured by Stripe
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={amount < MIN_TOP_UP}
            onClick={() => {
              addFunds(amount, bonus);
              toast(`${formatUsd(amount + bonus)} added to your balance`);
              onDone();
            }}
          >
            Pay {formatUsd(amount)}
          </Button>
        </div>
      </div>
    </div>
  );
}
