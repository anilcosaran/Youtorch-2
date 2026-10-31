"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  addRoute,
  updateRoute,
  type Model,
  type ModelVersion,
  type Route,
  type RouteUpdate,
  type TierCosts,
} from "@modelvend/admin-api/models";
import type { Provider } from "@modelvend/admin-api/providers";
import { Field, FormError } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { answersCustomers, isDecimal, marginTone, parseJsonObject, soldPrice, tierMargin } from "@/lib/catalog";
import { percent, unitPrice } from "@/lib/format";
import { PROVIDER_KIND_LABELS, UNIT_LABELS } from "@/lib/labels";
import { formErrors, isStale, toastError } from "@/lib/notify";
import { useSettings } from "@/lib/use-settings";
import { cn } from "@/lib/utils";
import { useApplyModel, useRefreshModel } from "./use-model-action";

const REGIONS = ["global", "us", "eu", "apac"];

/** A cost for a tier the version no longer has lands in the form error, under a name that says so. */
const LABELS: Record<string, string> = { providerId: "Provider", upstreamModel: "Upstream model", maxConcurrency: "Max concurrency", tierCosts: "Tier costs" };

const MARGIN_TEXT = {
  good: "font-medium text-foreground",
  neutral: "text-muted-foreground",
  warning: "font-medium text-status-warning",
  critical: "font-medium text-status-critical",
} as const;

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
  const refresh = useRefreshModel();
  const { minMargin } = useSettings();
  // What the form was filled from: a change made elsewhere since then is refused rather than overwritten.
  const [revision] = useState(model.revision);
  const { pricing } = version;
  const billing = pricing.unit;
  const nextPriority = Math.min(100, Math.max(0, ...version.routes.map((r) => r.priority)) + 1);
  const [providerId, setProviderId] = useState(route?.providerId ?? providers.find((p) => p.status === "active")?.id ?? "");
  const [upstreamModel, setUpstreamModel] = useState(route?.upstreamModel ?? "");
  const [priority, setPriority] = useState(String(route?.priority ?? nextPriority));
  const [weight, setWeight] = useState(String(route?.weight ?? 100));
  const [costs, setCosts] = useState<Record<string, string>>(() => Object.fromEntries(pricing.tiers.map((t) => [t.id, route?.tierCosts[t.id] ?? ""])));
  const [region, setRegion] = useState(route?.region ?? "global");
  const [concurrency, setConcurrency] = useState(route?.maxConcurrency ? String(route.maxConcurrency) : "");
  const [mapping, setMapping] = useState(route?.mapping ? JSON.stringify(route.mapping, null, 2) : "");
  const [transform, setTransform] = useState(route?.transform ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const priorityValue = wholeNumber(priority, 1, 100);
  const weightValue = wholeNumber(weight, 0, 100);
  const concurrencyValue = concurrency.trim() === "" ? null : wholeNumber(concurrency, 1);
  const parsedMapping = mapping.trim() ? parseJsonObject(mapping, "The mapping") : { value: null };
  const local: Record<string, string> = {};
  for (const tier of pricing.tiers) {
    const text = (costs[tier.id] ?? "").trim();
    if (text && !isDecimal(text)) local[`tierCosts.${tier.id}`] = "Digits with a dot for decimals, such as 0.084.";
  }
  if (priorityValue === null) local.priority = "A whole number from 1 to 100.";
  if (weightValue === null) local.weight = "A whole number from 0 to 100.";
  if (concurrency.trim() !== "" && concurrencyValue === null) local.maxConcurrency = "A whole number of 1 or more, or empty.";
  if ("error" in parsedMapping) local.mapping = parsedMapping.error;
  // A draft may leave a tier without a cost until it goes live; a version that answers customers needs them all.
  const missing = answersCustomers(version) && pricing.tiers.some((t) => !(costs[t.id] ?? "").trim());
  const invalid = !providerId || !upstreamModel.trim() || missing || Object.keys(local).length > 0;

  const provider = providers.find((p) => p.id === providerId);
  const regions = [...new Set([...(provider?.regions ?? []), ...REGIONS, region])];
  const promo = pricing.promo ?? 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid || busy || priorityValue === null || weightValue === null || "error" in parsedMapping) return;
    setBusy(true);
    setError(null);
    setFields({});
    const tierCosts: TierCosts = {};
    for (const tier of pricing.tiers) {
      const text = (costs[tier.id] ?? "").trim();
      if (text) tierCosts[tier.id] = text;
    }
    const body: RouteUpdate = {
      upstreamModel: upstreamModel.trim(),
      priority: priorityValue,
      weight: weightValue,
      tierCosts,
      region,
      maxConcurrency: concurrencyValue,
      mapping: parsedMapping.value,
      transform: transform.trim() || null,
    };
    try {
      const updated = route
        ? await updateRoute(model.id, version.id, route.id, revision, body)
        : await addRoute(model.id, version.id, revision, { ...body, providerId, upstreamModel: upstreamModel.trim(), tierCosts });
      apply(updated);
      toast.success(route ? "Route saved" : "Route added");
      onDone();
    } catch (err) {
      refresh(model.id);
      if (isStale(err)) {
        toastError(err, "Couldn't save the route");
        onDone();
        return;
      }
      const shown = formErrors(
        err,
        ["providerId", "upstreamModel", "priority", "weight", ...pricing.tiers.map((t) => `tierCosts.${t.id}`), "region", "maxConcurrency", "mapping", "transform"],
        LABELS,
      );
      setFields(shown.fields);
      setError(shown.message);
      setBusy(false);
    }
  };

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
        hint="The provider's own ID, e.g. veo-3.1-generate-001."
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
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Cost per {UNIT_LABELS[billing]}, by tier</legend>
        <p className="-mt-1 text-xs text-muted-foreground">
          What the provider charges us, in the version&apos;s billing unit.
          {!answersCustomers(version) && " A draft may leave a tier empty, but publishing asks for it."}
        </p>
        {pricing.tiers.map((tier) => {
          const text = (costs[tier.id] ?? "").trim();
          const share = text && isDecimal(text) ? tierMargin(pricing, tier, text) : null;
          const problem = fields[`tierCosts.${tier.id}`] ?? local[`tierCosts.${tier.id}`];
          return (
            <Field
              key={tier.id}
              id={`route-cost-${tier.id}`}
              label={tier.label}
              error={problem}
              hint={
                <>
                  Customers pay {unitPrice(soldPrice(pricing, tier.price))}
                  {promo > 0 && ` after the ${percent(promo, 0)} promo`}
                  {share !== null && (
                    <>
                      :{" "}
                      <span className={cn(MARGIN_TEXT[marginTone(share, minMargin)])}>{percent(share)} margin</span>
                      {share < 0
                        ? ". Every task at this tier on this route loses money"
                        : share < minMargin && `, under the ${percent(minMargin, 0)} minimum`}
                    </>
                  )}
                  .
                </>
              }
            >
              <Input
                id={`route-cost-${tier.id}`}
                inputMode="decimal"
                placeholder="0.05"
                required={answersCustomers(version)}
                value={costs[tier.id] ?? ""}
                onChange={(e) => setCosts((list) => ({ ...list, [tier.id]: e.target.value }))}
                aria-invalid={Boolean(problem)}
              />
            </Field>
          );
        })}
      </fieldset>
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
      <Field
        id="route-mapping"
        label="Mapping"
        hint="Our input to the provider's parameters, as a JSON object. Empty for none."
        error={fields.mapping ?? local.mapping}
      >
        <Textarea
          id="route-mapping"
          value={mapping}
          spellCheck={false}
          onChange={(e) => setMapping(e.target.value)}
          aria-invalid={Boolean(fields.mapping ?? local.mapping)}
          className="min-h-20 font-mono text-xs md:text-xs"
        />
      </Field>
      <Field
        id="route-transform"
        label="Transform"
        hint="A registered Go transform, for mappings the declarative form can't express. Empty for none."
        error={fields.transform}
      >
        <Input id="route-transform" value={transform} onChange={(e) => setTransform(e.target.value)} className="font-mono" />
      </Field>
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
      <DialogContent className="scroll-thin max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{route ? `Edit the ${route.providerName} route` : `Add a route to ${version.id}`}</DialogTitle>
          <DialogDescription>
            Tasks on {model.id}@{version.id} can be served by this provider. The strategy decides when.
          </DialogDescription>
        </DialogHeader>
        {open && <RouteForm model={model} version={version} route={route} providers={providers} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
