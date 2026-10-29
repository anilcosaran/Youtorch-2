"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { limitsFor, loweredLimits, TIER_LIMITS, TIERS, updateCustomer, type Customer, type Tier } from "@modelvend/admin-api/customers";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIER_LABELS } from "@/lib/labels";
import { formErrors } from "@/lib/notify";
import { storeCustomer } from "./cache";
import { formatLimit, LIMIT_KEYS, LIMIT_LABELS, type LimitKey } from "./limits";
import { dollarsError, parseCount, parseDollars } from "./money";
import { MoneyInput } from "./money-input";

const MAX_COUNT = 1_000_000;

/** The workspace's own value for a limit; null when it follows the tier. */
const overrideOf = (customer: Customer, key: LimitKey) =>
  customer.overrides.includes(key) ? customer.limits[key] : null;

/** A typed limit: null when empty, NaN when it isn't a valid value for that limit. */
function parseLimit(key: LimitKey, text: string): number | null {
  if (key === "monthlySpendCap") {
    const dollars = parseDollars(text);
    return dollars === null || dollars > 0 ? dollars : Number.NaN;
  }
  const n = parseCount(text);
  return n === null || (n >= 1 && n <= MAX_COUNT) ? n : Number.NaN;
}

const INVALID: Record<LimitKey, string> = {
  requestsPerMinute: "Enter a whole number from 1 to 1,000,000, or leave it empty.",
  concurrency: "Enter a whole number from 1 to 1,000,000, or leave it empty.",
  monthlySpendCap: "Enter an amount above $0 with at most two decimals, or leave it empty.",
};

/** The server's names for the fields this form shows. */
const FIELD = { tier: "tier", reason: "reason", ...Object.fromEntries(LIMIT_KEYS.map((key) => [key, `limits.${key}`])) } as Record<
  "tier" | "reason" | LimitKey,
  string
>;

function LimitsForm({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [tier, setTier] = useState<Tier>(customer.tier);
  const [values, setValues] = useState<Record<LimitKey, string>>(() => {
    const text = (key: LimitKey) => {
      const value = overrideOf(customer, key);
      return value === null ? "" : String(value);
    };
    return {
      requestsPerMinute: text("requestsPerMinute"),
      concurrency: text("concurrency"),
      monthlySpendCap: text("monthlySpendCap"),
    };
  });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const parsed = Object.fromEntries(LIMIT_KEYS.map((key) => [key, parseLimit(key, values[key])])) as Record<
    LimitKey,
    number | null
  >;
  const invalid = LIMIT_KEYS.some((key) => Number.isNaN(parsed[key]));
  const limitsChanged = LIMIT_KEYS.some((key) => parsed[key] !== overrideOf(customer, key));
  const tierChanged = tier !== customer.tier;
  const changed = tierChanged || limitsChanged;
  const defaults = TIER_LIMITS[tier];
  const after = limitsFor(tier, parsed);
  // What the change takes away; it starts refusing requests sooner, so it needs a reason on record.
  const lowered = invalid ? [] : loweredLimits({ tier: customer.tier, limits: customer.limits }, { tier, limits: after });
  const lowering = changed && lowered.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || invalid || busy || (lowering && !reason.trim())) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      // `limits` replaces every override, so all three go; null means the tier's default.
      const updated = await updateCustomer(customer.id, {
        ...(tierChanged && { tier }),
        ...(limitsChanged && { limits: parsed }),
        ...(reason.trim() && { reason: reason.trim() }),
      });
      storeCustomer(queryClient, updated);
      toast.success(`Limits saved for ${customer.workspace}`);
      onDone();
    } catch (err) {
      const shown = formErrors(err, Object.values(FIELD), { tier: "Tier" });
      setFields(shown.fields);
      setError(shown.message);
      setBusy(false);
    }
  };

  const fieldError = (key: LimitKey) => {
    if (fields[FIELD[key]]) return fields[FIELD[key]];
    if (!Number.isNaN(parsed[key])) return undefined;
    return (key === "monthlySpendCap" && dollarsError(values[key])) || INVALID[key];
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field id="tier" label="Tier" hint="Sets the default for every limit left empty." error={fields.tier}>
        <Select value={tier} onValueChange={(value) => setTier(value as Tier)}>
          <SelectTrigger id="tier" className="w-full" aria-invalid={Boolean(fields.tier)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {TIERS.map((t) => (
              <SelectItem key={t} value={t}>
                {TIER_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-xs text-muted-foreground">
          Overrides for this workspace. Leave a box empty to use the {TIER_LABELS[tier]} default.
        </legend>
        {LIMIT_KEYS.map((key) => {
          const id = `limit-${key}`;
          const fallback = `${TIER_LABELS[tier]} default: ${formatLimit(key, defaults[key])}`;
          const problem = fieldError(key);
          const change = (value: string) => setValues((v) => ({ ...v, [key]: value }));
          return (
            <Field key={key} id={id} label={LIMIT_LABELS[key]} error={problem}>
              {key === "monthlySpendCap" ? (
                <MoneyInput id={id} value={values[key]} onChange={change} placeholder={fallback} invalid={Boolean(problem)} />
              ) : (
                <Input
                  id={id}
                  inputMode="numeric"
                  autoComplete="off"
                  value={values[key]}
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
            <p className="font-medium">This lowers what {customer.workspace} may do, from its next request:</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {lowered.map((key) =>
                key === "tier" ? (
                  <li key={key}>
                    Tier: {TIER_LABELS[customer.tier]} → {TIER_LABELS[tier]}
                  </li>
                ) : (
                  <li key={key}>
                    {LIMIT_LABELS[key]}: {formatLimit(key, customer.limits[key])} → {formatLimit(key, after[key])}
                    {key === "monthlySpendCap" && ". Requests are refused once this month's spend reaches it"}
                  </li>
                ),
              )}
            </ul>
          </div>
          <Field id="limits-reason" label="Reason" hint="Required to lower limits; kept in the audit log." error={fields.reason}>
            <Textarea
              id="limits-reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why the workspace gets less, e.g. the customer asked to downgrade"
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

/** A workspace's tier and the limits it overrides: requests per minute, concurrency and spend cap. */
export function LimitsDialog({
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
          <DialogTitle>Tier &amp; limits</DialogTitle>
          <DialogDescription>
            For {customer.workspace}: its tier, and any limit that differs from the tier&apos;s default.
          </DialogDescription>
        </DialogHeader>
        {open && <LimitsForm customer={customer} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
