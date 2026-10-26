"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { MAX_TOP_UP, MIN_TOP_UP, parseAmount } from "@/lib/money";
import { useConsole } from "@/providers/console-provider";

/** The balance that triggers a reload: at least $1, so a reload never waits for a negative balance. */
const THRESHOLD = { min: 1, max: MAX_TOP_UP };
/** Each reload is a top-up and has the same limits. */
const RELOAD = { min: MIN_TOP_UP, max: MAX_TOP_UP };

export function AutoReloadForm({ onDone }: { onDone: () => void }) {
  const { autoReload, setAutoReload, paymentMethods } = useConsole();
  const toast = useToast();
  const card = paymentMethods[0];
  const [enabled, setEnabled] = useState(autoReload.enabled && !!card);
  const [threshold, setThreshold] = useState(String(autoReload.threshold));
  const [amount, setAmount] = useState(String(autoReload.amount));
  const thresholdCheck = parseAmount(threshold, THRESHOLD);
  const amountCheck = parseAmount(amount, RELOAD);
  const valid = !enabled || (!!card && thresholdCheck.ok && amountCheck.ok);

  const save = () => {
    if (!valid) return;
    if (enabled && thresholdCheck.ok && amountCheck.ok) {
      setAutoReload({ enabled: true, threshold: thresholdCheck.value, amount: amountCheck.value });
      toast(`Auto reload on: +${formatUsd(amountCheck.value)} below ${formatUsd(thresholdCheck.value)}`);
    } else {
      setAutoReload({ ...autoReload, enabled: false });
      toast("Auto reload turned off");
    }
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
        <div>
          <p className="text-[14px] font-medium">Enable auto reload</p>
          <p className="text-[13px] text-subtle">
            {card
              ? `Charged to ${card.brand} •••• ${card.last4}.`
              : "Needs a card on file. Cards can be added once billing is connected to Stripe."}
          </p>
        </div>
        <Switch label="Enable auto reload" checked={enabled} disabled={!card} onCheckedChange={setEnabled} />
      </div>
      <div className={cn("grid grid-cols-2 gap-3 transition", !enabled && "pointer-events-none opacity-40")}>
        <Field label="When balance falls below">
          <Input
            inputMode="decimal"
            className="tabular"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            aria-invalid={enabled && !thresholdCheck.ok}
          />
          {enabled && !thresholdCheck.ok && <span className="mt-1.5 block text-[12.5px] text-down">{thresholdCheck.error}</span>}
        </Field>
        <Field label="Reload balance by">
          <Input
            inputMode="decimal"
            className="tabular"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={enabled && !amountCheck.ok}
          />
          {enabled && !amountCheck.ok && <span className="mt-1.5 block text-[12.5px] text-down">{amountCheck.error}</span>}
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!valid} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
