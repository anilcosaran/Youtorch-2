"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  addRoute,
  BILLING_UNITS,
  updateRoute,
  type BillingUnit,
  type Model,
  type ModelVersion,
  type NewRoute,
  type Route,
} from "@modelvend/admin-api/models";
import type { Provider } from "@modelvend/admin-api/providers";
import { Field, FormError } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultTier, isEditable, routeMargin, soldPrice } from "@/lib/catalog";
import { percent, unitPrice } from "@/lib/format";
import { PROVIDER_KIND_LABELS, UNIT_LABELS } from "@/lib/labels";
import { formErrors } from "@/lib/notify";
import { useApplyModel } from "./use-model-action";

const REGIONS = ["global", "us", "eu", "apac"];

/** The server's names for the fields this form shows. */
const SHOWN = ["providerId", "upstreamModel", "priority", "weight", "cost", "cost.price", "cost.unit", "region", "maxConcurrency"];
const LABELS: Record<string, string> = { providerId: "Provider", upstreamModel: "Upstream model", maxConcurrency: "Max concurrency" };

/** A whole number typed in a box, within bounds; null when it isn't one. */
function wholeNumber(text: string, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
  const clean = text.trim();
  if (!/^\d+$/.test(clean)) return null;
  const n = Number(clean);
  return n >= min && n <= max ? n : null;
}

function RouteForm({
  model,
  version,
  route,
  providers,
  onDone,
}: {
  model: Model;
  version: ModelVersion;
  route: Route | null;
  providers: Provider[];
  onDone: () => void;
}) {
  const apply = useApplyModel();
  const billing = version.pricing.unit;
  const nextPriority = Math.min(100, Math.max(0, ...version.routes.map((r) => r.priority)) + 1);
  const [providerId, setProviderId] = useState(route?.providerId ?? providers.find((p) => p.status === "active")?.id ?? "");
  const [upstreamModel, setUpstreamModel] = useState(route?.upstreamModel ?? "");
  const [priority, setPriority] = useState(String(route?.priority ?? nextPriority));
  const [weight, setWeight] = useState(String(route?.weight ?? 100));
  const [cost, setCost] = useState(route ? String(route.cost.price) : "");
  // The route keeps its own unit: a number per second must not be relabelled per image by an unrelated edit.
  const [unit, setUnit] = useState<BillingUnit>(route?.cost.unit ?? billing);
  const [region, setRegion] = useState(route?.region ?? "global");
  const [concurrency, setConcurrency] = useState(route?.maxConcurrency ? String(route.maxConcurrency) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const tier = defaultTier(version.pricing);
  const costValue = cost.trim() === "" ? Number.NaN : Number(cost);
  const priorityValue = wholeNumber(priority, 1, 100);
  const weightValue = wholeNumber(weight, 0, 100);
  const concurrencyValue = concurrency.trim() === "" ? null : wholeNumber(concurrency, 1);
  const local: Record<string, string> = {};
  if (cost.trim() !== "" && !(costValue >= 0)) local.cost = "Enter a cost of 0 or more, with a dot for decimals.";
  if (priorityValue === null) local.priority = "A whole number from 1 to 100.";
  if (weightValue === null) local.weight = "A whole number from 0 to 100.";
  if (concurrency.trim() !== "" && concurrencyValue === null) local.maxConcurrency = "A whole number of 1 or more, or empty.";
  const invalid = !providerId || !upstreamModel.trim() || !(costValue >= 0) || Object.keys(local).length > 0;

  const share = costValue >= 0 ? routeMargin(version.pricing, { unit, price: costValue }) : null;
  const promo = version.pricing.promo ?? 0;
  const otherUnit = unit !== billing;
  // Live and deprecated versions can't change their unit, so a new cost must be in it.
  const unitLocked = !isEditable(version);
  const provider = providers.find((p) => p.id === providerId);
  const regions = [...new Set([...(provider?.regions ?? []), ...REGIONS, region])];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || busy || priorityValue === null || weightValue === null) return;
    setBusy(true);
    setError(null);
    setFields({});
    const body: NewRoute = {
      providerId,
      upstreamModel: upstreamModel.trim(),
      priority: priorityValue,
      weight: weightValue,
      cost: { unit, price: costValue },
      region,
      maxConcurrency: concurrencyValue,
    };
    try {
      const updated = route
        ? await updateRoute(model.id, version.id, route.id, body)
        : await addRoute(model.id, version.id, body);
      apply(updated);
      toast.success(route ? "Route saved" : "Route added");
      onDone();
    } catch (err) {
      const shown = formErrors(err, SHOWN, LABELS);
      setFields(shown.fields);
      setError(shown.message);
      setBusy(false);
    }
  };

  const costError = fields["cost.price"] ?? fields["cost.unit"] ?? fields.cost ?? local.cost;

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field id="route-provider" label="Provider" error={fields.providerId}>
        <Select value={providerId} onValueChange={setProviderId} disabled={route !== null}>
          <SelectTrigger id="route-provider" className="w-full">
            <SelectValue placeholder="Pick a provider" />
          </SelectTrigger>
          <SelectContent>
            {route && !providers.some((p) => p.id === route.providerId) && (
              <SelectItem value={route.providerId}>{route.providerName}</SelectItem>
            )}
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id} disabled={p.status === "disabled"}>
                {p.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {PROVIDER_KIND_LABELS[p.kind]}
                  {p.status !== "active" && ` · ${p.status}`}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        id="route-upstream"
        label="Upstream model"
        hint="The provider's own ID, e.g. fal-ai/kling-video/v3/pro/text-to-video."
        error={fields.upstreamModel}
      >
        <Input
          id="route-upstream"
          required
          autoFocus
          value={upstreamModel}
          onChange={(e) => setUpstreamModel(e.target.value)}
          className="font-mono"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="route-cost" label={`Cost per ${UNIT_LABELS[unit]}`} hint="What the provider charges us." error={costError}>
          <Input
            id="route-cost"
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            required
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            aria-invalid={Boolean(costError)}
          />
        </Field>
        <Field id="route-unit" label="Cost unit" hint={`The version bills per ${UNIT_LABELS[billing]}.`}>
          <Select value={unit} onValueChange={(value) => setUnit(value as BillingUnit)}>
            <SelectTrigger id="route-unit" className="w-full" aria-invalid={otherUnit}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  Per {UNIT_LABELS[u]}
                  {u === billing && <span className="text-muted-foreground"> · the version&apos;s unit</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {otherUnit && (
        <p role="alert" className="rounded-lg bg-status-warning/10 px-3 py-2 text-xs">
          {unitLocked
            ? `This ${version.status} version bills per ${UNIT_LABELS[billing]} and can't change its unit, so a new cost has to be per ${UNIT_LABELS[billing]} too.`
            : `This cost is per ${UNIT_LABELS[unit]} but ${version.id} bills per ${UNIT_LABELS[billing]}, so there is no margin to show and the version can't be promoted until the two match. Use this while moving the version to another billing unit.`}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="route-priority" label="Priority" hint="1 to 100; lower goes first." error={fields.priority ?? local.priority}>
          <Input
            id="route-priority"
            type="number"
            step={1}
            min={1}
            max={100}
            required
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            aria-invalid={Boolean(fields.priority ?? local.priority)}
          />
        </Field>
        <Field id="route-weight" label="Weight %" hint="Weighted split only." error={fields.weight ?? local.weight}>
          <Input
            id="route-weight"
            type="number"
            step={1}
            min={0}
            max={100}
            required
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            aria-invalid={Boolean(fields.weight ?? local.weight)}
          />
        </Field>
        <Field id="route-region" label="Region" error={fields.region}>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger id="route-region" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {regions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field
        id="route-concurrency"
        label="Max concurrency"
        hint="Empty for the provider's limit."
        error={fields.maxConcurrency ?? local.maxConcurrency}
      >
        <Input
          id="route-concurrency"
          type="number"
          step={1}
          min={1}
          value={concurrency}
          onChange={(e) => setConcurrency(e.target.value)}
          aria-invalid={Boolean(fields.maxConcurrency ?? local.maxConcurrency)}
        />
      </Field>
      {tier && share !== null && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          At the default tier ({tier.label}) customers pay {unitPrice(soldPrice(version.pricing, tier.price))}
          {promo > 0 && ` after the ${percent(promo, 0)} promo`} and this route costs {unitPrice(costValue)}:{" "}
          <span className={share < 0 ? "font-medium text-status-critical" : "font-medium text-foreground"}>
            {percent(share)} margin
          </span>
          {share < 0 && ". Every request on this route loses money."}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || invalid}>
          {busy && <LoaderCircle className="animate-spin" />}
          {route ? "Save route" : "Add route"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Adds a provider route to a version, or edits one. */
export function RouteDialog({
  model,
  version,
  route,
  open,
  providers,
  onClose,
}: {
  model: Model;
  version: ModelVersion;
  route: Route | null;
  open: boolean;
  providers: Provider[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{route ? `Edit the ${route.providerName} route` : `Add a route to ${version.id}`}</DialogTitle>
          <DialogDescription>
            Requests to {model.id}@{version.id} can be served by this provider. The strategy decides when.
          </DialogDescription>
        </DialogHeader>
        {open && <RouteForm model={model} version={version} route={route} providers={providers} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
