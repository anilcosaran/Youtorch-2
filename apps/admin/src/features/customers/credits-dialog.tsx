"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@modelvend/admin-api/client";
import { adjustCredits, CREDIT_KINDS, type CreditKind, type Customer } from "@modelvend/admin-api/customers";
import { toMicros } from "@modelvend/admin-api/money";
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
import { CREDIT_KIND_LABELS } from "@/lib/labels";
import { formErrors } from "@/lib/notify";
import { keys } from "@/lib/query-keys";
import { useSession } from "@/lib/session";
import { Balance } from "./balance";
import { storeCustomer } from "./cache";
import { dollarsError, parseDollars } from "./money";
import { MoneyInput } from "./money-input";

type Direction = "add" | "take";

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "add", label: "Add" },
  { value: "take", label: "Take back" },
];

const KINDS = CREDIT_KINDS.map((value) => ({ value, label: CREDIT_KIND_LABELS[value] }));

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
      {next !== null && next < 0 && <p className="text-xs text-status-critical">That leaves the balance below zero.</p>}
    </div>
  );
}

/** Above this only an admin may add or take credits; from it on the form also asks for a second press. */
const LARGE_CREDIT_CHANGE = toMicros(1000);

function CreditsForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { operator } = useSession();
  const [direction, setDirection] = useState<Direction>("add");
  const [kind, setKind] = useState<CreditKind | null>(null);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  // The signed amount the operator was asked to confirm; any edit asks again.
  const [confirmed, setConfirmed] = useState<number | null>(null);
  // The balance on this page may be behind, so the server can ask for this too (422 `negative_balance`).
  const [negativeAsked, setNegativeAsked] = useState(false);
  const [allowNegative, setAllowNegative] = useState(false);

  const amount = parseDollars(text);
  const typoError = dollarsError(text);
  const invalid = amount !== null && !(amount > 0);
  const micros = amount === null || invalid ? null : toMicros(amount);
  const signed = micros === null ? null : direction === "add" ? micros : -micros;
  const next = signed === null ? null : customer.balanceMicros + signed;
  const asksNegative = negativeAsked || (direction === "take" && next !== null && next < 0);
  const needsKind = direction === "add" && kind === null;
  // The server enforces this with a 403; saying so here spares the round trip.
  const overAdminLimit = operator?.role !== "admin" && micros !== null && micros > LARGE_CREDIT_CHANGE;
  const ready = signed !== null && reason.trim().length > 0 && !needsKind && !overAdminLimit && (!asksNegative || allowNegative);
  const large = micros !== null && micros >= LARGE_CREDIT_CHANGE;
  const confirming = large && confirmed !== null && confirmed === signed;

  const startOver = () => {
    setConfirmed(null);
    setNegativeAsked(false);
    setAllowNegative(false);
  };

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
      const updated = await adjustCredits(customer.id, {
        amountMicros: signed,
        reason: reason.trim(),
        ...(direction === "add" && kind ? { kind } : {}),
        ...(asksNegative && allowNegative ? { confirmNegative: true } : {}),
      });
      storeCustomer(queryClient, updated);
      toast.success(
        signed > 0
          ? `Added ${usd(signed)} to ${customer.name}`
          : `Took back ${usd(-signed)} from ${customer.name}`,
        { description: `The balance is now ${usd(updated.balanceMicros)}.` },
      );
      onDone();
    } catch (err) {
      void queryClient.invalidateQueries({ queryKey: keys.customer(customer.id) });
      if (err instanceof ApiError && err.code === "negative_balance") setNegativeAsked(true);
      const shown = formErrors(err, ["amountMicros", "kind", "reason"]);
      setFields(shown.fields);
      setError(shown.message);
      setConfirmed(null);
      setBusy(false);
    }
  };

  const verb = direction === "add" ? "Add" : "Take back";
  const amountError =
    fields.amountMicros ??
    typoError ??
    (invalid
      ? "Enter an amount above $0 with at most two decimals."
      : overAdminLimit
        ? `Only an admin can move more than ${usd(LARGE_CREDIT_CHANGE)} at once.`
        : undefined);
  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Segmented
        label="Add or take back"
        value={direction}
        onChange={(value) => {
          setDirection(value);
          startOver();
        }}
        options={DIRECTIONS}
      />
      <Field
        id="credit-amount"
        label={direction === "add" ? "Amount to add" : "Amount to take back"}
        hint={
          operator?.role === "admin"
            ? "In US dollars, with a dot for cents: 1,250.50"
            : `In US dollars, with a dot for cents. Only an admin can move more than ${usd(LARGE_CREDIT_CHANGE)} at once, either way.`
        }
        error={amountError}
      >
        <MoneyInput
          id="credit-amount"
          autoFocus
          value={text}
          onChange={(value) => {
            changeAmount(value);
            startOver();
          }}
          placeholder="25.00"
          invalid={Boolean(amountError)}
        />
      </Field>
      {direction === "add" && (
        <fieldset className="grid justify-items-start gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Kind of credit</legend>
          <Segmented label="Kind of credit" value={kind} onChange={setKind} options={KINDS} />
          {fields.kind ? (
            <p role="alert" className="text-xs text-destructive">
              {fields.kind}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Decides when it expires, and purchased credit counts as revenue when it is used.</p>
          )}
        </fieldset>
      )}
      <Field id="credit-reason" label="Reason" hint="Shown in the ledger and the audit log." error={fields.reason}>
        <Textarea
          id="credit-reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={direction === "add" ? "Why they get credit" : "Why the credit is taken back"}
          maxLength={500}
          aria-invalid={Boolean(fields.reason)}
          className="min-h-20"
        />
      </Field>
      <BalancePreview now={customer.balanceMicros} next={next} />
      {asksNegative && (
        <label className="flex items-start gap-2 rounded-lg bg-status-warning/10 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={allowNegative}
            onChange={(e) => setAllowNegative(e.target.checked)}
            className="mt-0.5 accent-[var(--brand)]"
          />
          <span>Let the balance go below zero. New tasks are refused until a top-up clears it.</span>
        </label>
      )}
      {confirming && signed !== null && (
        <p role="alert" className="rounded-lg bg-status-warning/10 px-3 py-2 text-sm">
          <span className="font-medium">
            {signed > 0 ? `Add ${usd(signed)} to ${customer.name}?` : `Take ${usd(-signed)} back from ${customer.name}?`}
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
          {micros !== null
            ? `${confirming ? "Yes, " : ""}${confirming ? verb.toLowerCase() : verb} ${usd(micros)}`
            : verb}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Adds credit to a workspace or takes it back; every change lands in the ledger with its reason. */
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
      <DialogContent className="scroll-thin max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust credits</DialogTitle>
          <DialogDescription>
            Changes the prepaid balance of {customer.name} at once. Tasks draw on it as usual.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every visit starts empty. */}
        {open && <CreditsForm customer={customer} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
