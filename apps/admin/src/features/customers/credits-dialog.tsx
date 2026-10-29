"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { formErrors } from "@/lib/notify";
import { Balance } from "./balance";
import { storeCustomer } from "./cache";
import { dollarsError, parseDollars } from "./money";
import { MoneyInput } from "./money-input";

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

/** Changes this large need a second, explicit confirmation. */
const LARGE_CREDIT_CHANGE = 1000;

function CreditsForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<Direction>("grant");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  // The signed amount the operator was asked to confirm; any edit asks again.
  const [confirmed, setConfirmed] = useState<number | null>(null);

  const amount = parseDollars(text);
  const typoError = dollarsError(text);
  const invalid = amount !== null && !(amount > 0);
  const signed = amount === null || invalid ? null : direction === "grant" ? amount : -amount;
  const next = signed === null ? null : customer.balance + signed;
  const ready = signed !== null && reason.trim().length > 0;
  const large = signed !== null && Math.abs(signed) >= LARGE_CREDIT_CHANGE;
  const confirming = large && confirmed !== null && confirmed === signed;

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
    if (!ready || signed === null || busy) return;
    // A large change shows what it does first and goes through on the second press.
    if (large && !confirming) {
      setConfirmed(signed);
      return;
    }
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
      const shown = formErrors(err, ["amount", "reason"]);
      setFields(shown.fields);
      setError(shown.message);
      setConfirmed(null);
      setBusy(false);
    }
  };

  const verb = direction === "grant" ? "Grant" : "Take back";
  const amountError =
    fields.amount ?? typoError ?? (invalid ? "Enter an amount above $0 with at most two decimals." : undefined);
  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Segmented
        label="Grant or take back"
        value={direction}
        onChange={(value) => {
          setDirection(value);
          setConfirmed(null);
        }}
        options={DIRECTIONS}
      />
      <Field
        id="credit-amount"
        label={direction === "grant" ? "Amount to grant" : "Amount to take back"}
        hint="In US dollars, with a dot for cents: 1,250.50"
        error={amountError}
      >
        <MoneyInput
          id="credit-amount"
          autoFocus
          value={text}
          onChange={(value) => {
            changeAmount(value);
            setConfirmed(null);
          }}
          placeholder="25.00"
          invalid={Boolean(amountError)}
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
      {confirming && signed !== null && (
        <p role="alert" className="rounded-lg bg-status-warning/10 px-3 py-2 text-sm">
          <span className="font-medium">
            {signed > 0 ? `Grant ${usd(signed)} to ${customer.workspace}?` : `Take ${usd(-signed)} back from ${customer.workspace}?`}
          </span>{" "}
          <span className="text-muted-foreground">
            That&apos;s {usd(LARGE_CREDIT_CHANGE)} or more, so check the amount. Press the button again to confirm.
          </span>
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant={confirming && signed !== null && signed < 0 ? "destructive" : "default"} disabled={busy || !ready}>
          {busy && <LoaderCircle className="animate-spin" />}
          {amount !== null && !invalid
            ? `${confirming ? "Yes, " : ""}${confirming ? verb.toLowerCase() : verb} ${usd(amount)}`
            : verb}
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
