"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage, fieldErrors } from "@modelvend/admin-api/client";
import { adjustCredits, type Customer } from "@modelvend/admin-api/customers";
import { Field, FormError } from "@/components/shared/field";
import { Segmented } from "@/components/shared/segmented";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { usd } from "@/lib/format";
import { Balance } from "./balance";
import { storeCustomer } from "./cache";
import { MoneyInput, parseDollars } from "./money-input";

type Direction = "grant" | "take";

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "grant", label: "Grant" },
  { value: "take", label: "Take back" },
];

/** The balance now and after the change, so a typo shows before it's saved. */
function BalancePreview({ now, next }: { now: number; next: number | null }) {
  return (
    <div className="grid gap-1 rounded-lg bg-muted/50 px-3 py-2.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Balance</span>
        <span className="ml-auto flex items-center gap-2">
          <Balance value={now} className="text-muted-foreground" />
          <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="sr-only">becomes</span>
          {next === null ? <span className="text-muted-foreground">—</span> : <Balance value={next} />}
        </span>
      </div>
      {next !== null && next < 0 && (
        <p className="text-xs text-status-critical">This takes back more than they have left.</p>
      )}
    </div>
  );
}

function CreditsForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<Direction>("grant");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const amount = parseDollars(text);
  const invalid = amount !== null && !(amount > 0);
  const signed = amount === null || invalid ? null : direction === "grant" ? amount : -amount;
  const next = signed === null ? null : customer.balance + signed;
  const ready = signed !== null && reason.trim().length > 0;

  // A minus sign means taking credit back, so either way of typing it works.
  const changeAmount = (value: string) => {
    if (value.trimStart().startsWith("-")) {
      setDirection("take");
      setText(value.replace("-", ""));
    } else {
      setText(value);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || signed === null) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const updated = await adjustCredits(customer.id, { amount: signed, reason: reason.trim() });
      storeCustomer(queryClient, updated);
      toast.success(
        signed > 0
          ? `Granted ${usd(signed)} to ${customer.name}`
          : `Took back ${usd(-signed)} from ${customer.name}`,
        { description: `The balance is now ${usd(updated.balance)}.` },
      );
      onDone();
    } catch (err) {
      const byField = fieldErrors(err);
      setFields(byField);
      if (!byField.amount && !byField.reason) setError(errorMessage(err));
      setBusy(false);
    }
  };

  const verb = direction === "grant" ? "Grant" : "Take back";
  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Segmented label="Grant or take back" value={direction} onChange={setDirection} options={DIRECTIONS} />
      <Field
        id="credit-amount"
        label={direction === "grant" ? "Amount to grant" : "Amount to take back"}
        error={fields.amount ?? (invalid ? "Enter an amount above $0 with at most two decimals." : undefined)}
      >
        <MoneyInput
          id="credit-amount"
          autoFocus
          value={text}
          onChange={changeAmount}
          placeholder="25.00"
          invalid={invalid || Boolean(fields.amount)}
        />
      </Field>
      <Field id="credit-reason" label="Reason" hint="Shown in the ledger and the audit log." error={fields.reason}>
        <Textarea
          id="credit-reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={direction === "grant" ? "Why they get credit" : "Why the credit is taken back"}
          maxLength={500}
          aria-invalid={Boolean(fields.reason)}
          className="min-h-20"
        />
      </Field>
      <BalancePreview now={customer.balance} next={next} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !ready}>
          {busy && <LoaderCircle className="animate-spin" />}
          {amount !== null && !invalid ? `${verb} ${usd(amount)}` : verb}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Grants credit to a workspace or takes it back; every change lands in the ledger with its reason. */
export function CreditsDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust credits</DialogTitle>
          <DialogDescription>
            Changes the prepaid balance of {customer.workspace} at once. Requests draw on it as usual.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every visit starts empty. */}
        {open && <CreditsForm customer={customer} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
