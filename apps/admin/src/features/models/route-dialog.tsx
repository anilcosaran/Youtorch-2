"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage, fieldErrors } from "@/lib/api/client";
import { addRoute, updateRoute, type Model, type ModelVersion, type NewRoute, type Route } from "@/lib/api/models";
import type { Provider } from "@/lib/api/providers";
import { defaultTier, margin } from "@/lib/catalog";
import { percent, unitPrice } from "@/lib/format";
import { PROVIDER_KIND_LABELS, UNIT_LABELS } from "@/lib/labels";
import { useApplyModel } from "./use-model-action";

const REGIONS = ["global", "us", "eu", "apac"];

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
  const nextPriority = Math.max(0, ...version.routes.map((r) => r.priority)) + 1;
  const [providerId, setProviderId] = useState(route?.providerId ?? providers.find((p) => p.status === "active")?.id ?? "");
  const [upstreamModel, setUpstreamModel] = useState(route?.upstreamModel ?? "");
  const [priority, setPriority] = useState(String(route?.priority ?? nextPriority));
  const [weight, setWeight] = useState(String(route?.weight ?? 100));
  const [cost, setCost] = useState(route ? String(route.cost.price) : "");
  const [region, setRegion] = useState(route?.region ?? "global");
  const [concurrency, setConcurrency] = useState(route?.maxConcurrency ? String(route.maxConcurrency) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const tier = defaultTier(version.pricing);
  const costValue = Number(cost);
  const share = cost && Number.isFinite(costValue) ? margin(tier?.price, costValue) : null;
  const invalid =
    !providerId ||
    !upstreamModel.trim() ||
    !cost ||
    !Number.isFinite(costValue) ||
    costValue < 0 ||
    !Number.isInteger(Number(priority)) ||
    Number(weight) < 0 ||
    Number(weight) > 100;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError(null);
    const body: NewRoute = {
      providerId,
      upstreamModel: upstreamModel.trim(),
      priority: Number(priority),
      weight: Number(weight),
      cost: { unit: version.pricing.unit, price: costValue },
      region,
      maxConcurrency: concurrency ? Number(concurrency) : null,
    };
    try {
      const updated = route
        ? await updateRoute(model.id, version.id, route.id, body)
        : await addRoute(model.id, version.id, body);
      apply(updated);
      toast.success(route ? "Route saved" : "Route added");
      onDone();
    } catch (err) {
      setFields(fieldErrors(err));
      setError(Object.keys(fieldErrors(err)).length ? null : errorMessage(err));
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="route-cost" label={`Cost per ${UNIT_LABELS[version.pricing.unit]}`} error={fields.cost}>
          <Input
            id="route-cost"
            type="number"
            inputMode="decimal"
            step="0.0001"
            min={0}
            required
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </Field>
        <Field id="route-priority" label="Priority" hint="Lower goes first.">
          <Input id="route-priority" type="number" step={1} value={priority} onChange={(e) => setPriority(e.target.value)} />
        </Field>
        <Field id="route-weight" label="Weight %" hint="Weighted split only.">
          <Input id="route-weight" type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="route-region" label="Region">
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger id="route-region" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="route-concurrency" label="Max concurrency" hint="Empty for the provider's limit.">
          <Input
            id="route-concurrency"
            type="number"
            min={1}
            value={concurrency}
            onChange={(e) => setConcurrency(e.target.value)}
          />
        </Field>
      </div>
      {tier && share !== null && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          At the default tier ({tier.label}) customers pay {unitPrice(tier.price)} and this route costs {unitPrice(costValue)}:{" "}
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
