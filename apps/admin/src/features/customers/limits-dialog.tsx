"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { errorMessage, fieldErrors } from "@/lib/api/client";
import { TIER_LIMITS, TIERS, updateCustomer, type Customer, type Tier } from "@/lib/api/customers";
import { TIER_LABELS } from "@/lib/labels";
import { storeCustomer } from "./cache";
import { formatLimit, LIMIT_KEYS, LIMIT_LABELS, type LimitKey } from "./limits";
import { MoneyInput, parseDollars } from "./money-input";

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
  const clean = text.trim().replace(/,/g, "");
  if (clean === "") return null;
  const n = Number(clean);
  return /^\d+$/.test(clean) && n >= 1 && n <= MAX_COUNT ? n : Number.NaN;
}

const INVALID: Record<LimitKey, string> = {
  requestsPerMinute: "Enter a whole number from 1 to 1,000,000, or leave it empty.",
  concurrency: "Enter a whole number from 1 to 1,000,000, or leave it empty.",
  monthlySpendCap: "Enter an amount above $0 with at most two decimals, or leave it empty.",
};

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || invalid) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      // `limits` replaces every override, so all three go; null means the tier's default.
      const updated = await updateCustomer(customer.id, {
        ...(tierChanged && { tier }),
        ...(limitsChanged && { limits: parsed }),
      });
      storeCustomer(queryClient, updated);
      toast.success(`Limits saved for ${customer.workspace}`);
      onDone();
    } catch (err) {
      const byField = fieldErrors(err);
      setFields(byField);
      const known = ["tier", ...LIMIT_KEYS];
      if (!Object.keys(byField).some((field) => known.includes(field))) setError(errorMessage(err));
      setBusy(false);
    }
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
          const bad = Number.isNaN(parsed[key]);
          const change = (value: string) => setValues((v) => ({ ...v, [key]: value }));
          return (
            <Field key={key} id={id} label={LIMIT_LABELS[key]} error={fields[key] ?? (bad ? INVALID[key] : undefined)}>
              {key === "monthlySpendCap" ? (
                <MoneyInput
                  id={id}
                  value={values[key]}
                  onChange={change}
                  placeholder={fallback}
                  invalid={bad || Boolean(fields[key])}
                />
              ) : (
                <Input
                  id={id}
                  inputMode="numeric"
                  autoComplete="off"
                  value={values[key]}
                  onChange={(e) => change(e.target.value)}
                  placeholder={fallback}
                  aria-invalid={bad || Boolean(fields[key])}
                  className="tabular"
                />
              )}
            </Field>
          );
        })}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !changed || invalid}>
          {busy && <LoaderCircle className="animate-spin" />}
          Save limits
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
