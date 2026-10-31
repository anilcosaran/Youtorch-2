"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { limitsFor, LIMIT_NAMES, loweredLimits, updateCustomer, type Customer, type LimitName, type Limits } from "@modelvend/admin-api/customers";
import { Field, FormError } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { integer } from "@/lib/format";
import { formErrors } from "@/lib/notify";
import { keys } from "@/lib/query-keys";
import { useSettings } from "@/lib/use-settings";
import { storeCustomer } from "./cache";
import { formatLimit, isMoneyLimit, LIMIT_BOUNDS, LIMIT_LABELS, limitText, parseLimit } from "./limits";
import { dollarsError } from "./money";
import { MoneyInput } from "./money-input";

/** The workspace's own value for a limit; null when it follows the platform default. */
const ownValue = (customer: Customer, name: LimitName) => (customer.overrides.includes(name) ? customer.limits[name] : null);

function invalidText(name: LimitName): string {
  const bounds = LIMIT_BOUNDS[name];
  return bounds
    ? `Enter a whole number from ${integer(bounds.min)} to ${integer(bounds.max)}, or leave it empty.`
    : "Enter an amount above $0 with at most two decimals, or leave it empty.";
}

/** The server's name for a limit's field. */
const fieldOf = (name: LimitName) => `limits.${name}`;

function LimitsForm({ customer, defaults, onDone }: { customer: Customer; defaults: Limits; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(
    () => Object.fromEntries(LIMIT_NAMES.map((name) => [name, limitText(name, ownValue(customer, name))])) as Record<LimitName, string>,
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const parsed = Object.fromEntries(LIMIT_NAMES.map((name) => [name, parseLimit(name, values[name])])) as Record<LimitName, number | null>;
  const invalid = LIMIT_NAMES.some((name) => Number.isNaN(parsed[name]));
  const changed = LIMIT_NAMES.some((name) => parsed[name] !== ownValue(customer, name));
  const after = limitsFor(defaults, parsed);
  // What the change takes away; it starts refusing tasks sooner, so it needs a reason on record.
  const lowered = invalid ? [] : loweredLimits(customer.limits, after);
  const lowering = changed && lowered.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || invalid || busy || (lowering && !reason.trim())) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      // `limits` replaces every value of its own, so all of them go; null follows the platform default.
      const updated = await updateCustomer(customer.id, {
        limits: parsed,
        ...(lowering && { reason: reason.trim() }),
      });
      storeCustomer(queryClient, updated);
      toast.success(`Limits saved for ${customer.name}`);
      onDone();
    } catch (err) {
      void queryClient.invalidateQueries({ queryKey: keys.customer(customer.id) });
      const shown = formErrors(err, [...LIMIT_NAMES.map(fieldOf), "reason"]);
      setFields(shown.fields);
      setError(shown.message);
      setBusy(false);
    }
  };

  const fieldError = (name: LimitName) => {
    if (fields[fieldOf(name)]) return fields[fieldOf(name)];
    if (!Number.isNaN(parsed[name])) return undefined;
    return (isMoneyLimit(name) && dollarsError(values[name])) || invalidText(name);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-xs text-muted-foreground">
          This workspace&apos;s own values. Leave a box empty to follow the platform default.
        </legend>
        {LIMIT_NAMES.map((name) => {
          const id = `limit-${name}`;
          const fallback = `Default: ${formatLimit(name, defaults[name])}`;
          const problem = fieldError(name);
          const change = (value: string) => setValues((v) => ({ ...v, [name]: value }));
          return (
            <Field key={name} id={id} label={LIMIT_LABELS[name]} hint={name === "queueWaitSeconds" ? "In seconds." : undefined} error={problem}>
              {isMoneyLimit(name) ? (
                <MoneyInput id={id} value={values[name]} onChange={change} placeholder={fallback} invalid={Boolean(problem)} />
              ) : (
                <Input
                  id={id}
                  inputMode="numeric"
                  autoComplete="off"
                  value={values[name]}
                  onChange={(e) => change(e.target.value)}
                  placeholder={fallback}
                  aria-invalid={Boolean(problem)}
                  className="tabular"
                />
              )}
            </Field>
          );
        })}
      </fieldset>
      {lowering && (
        <div role="alert" className="grid gap-3 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2.5 text-sm">
          <div>
            <p className="font-medium">This lowers what {customer.name} may do, from its next task; running tasks aren&apos;t touched:</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {lowered.map((name) => (
                <li key={name}>
                  {LIMIT_LABELS[name]}: {formatLimit(name, customer.limits[name])} → {formatLimit(name, after[name])}
                </li>
              ))}
            </ul>
          </div>
          <Field id="limits-reason" label="Reason" hint="Required to lower limits; kept in the audit log." error={fields.reason}>
            <Textarea
              id="limits-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why the workspace gets less"
              maxLength={500}
              aria-invalid={Boolean(fields.reason)}
              className="min-h-16 bg-background"
            />
          </Field>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={lowering ? "destructive" : "default"}
          disabled={busy || !changed || invalid || (lowering && !reason.trim())}
        >
          {busy && <LoaderCircle className="animate-spin" />}
          {lowering ? "Lower limits" : "Save limits"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The limits a workspace has of its own, on top of the platform defaults. */
export function LimitsDialog({
  customer,
  open,
  onOpenChange,
}: {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { limits: defaults, failed } = useSettings();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="scroll-thin max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Limits</DialogTitle>
          <DialogDescription>For {customer.name}: any limit that differs from the platform default.</DialogDescription>
        </DialogHeader>
        {open &&
          (defaults ? (
            <LimitsForm customer={customer} defaults={defaults} onDone={() => onOpenChange(false)} />
          ) : failed ? (
            <FormError message="Couldn't load the platform defaults, which this form needs. Close it and try again." />
          ) : (
            <Skeleton className="h-64 rounded-lg" />
          ))}
      </DialogContent>
    </Dialog>
  );
}
