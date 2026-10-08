"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatUsd } from "@/lib/format";
import { useConsole } from "@/providers/console-provider";

export function AutoReloadForm({ onDone }: { onDone: () => void }) {
  const { autoReload, setAutoReload } = useConsole();
  const toast = useToast();
  const [draft, setDraft] = useState(autoReload);

  const save = () => {
    setAutoReload(draft);
    toast(draft.enabled ? `Auto reload on: +${formatUsd(draft.amount)} below ${formatUsd(draft.threshold)}` : "Auto reload turned off");
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
        <div>
          <p className="text-[14px] font-medium">Enable auto reload</p>
          <p className="text-[13px] text-subtle">Charged to your default payment method.</p>
        </div>
        <Switch label="Enable auto reload" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
      </div>
      <div className={cn("grid grid-cols-2 gap-3 transition", !draft.enabled && "pointer-events-none opacity-40")}>
        <Field label="When balance falls below">
          <Input
            type="number"
            className="tabular"
            value={draft.threshold}
            onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })}
          />
        </Field>
        <Field label="Reload balance by">
          <Input
            type="number"
            className="tabular"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
