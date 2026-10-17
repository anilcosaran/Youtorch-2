"use client";

import { useState } from "react";
import { LoaderCircle, Lock, Plus, X } from "lucide-react";
import { BILLING_UNITS, updateVersion, type BillingUnit, type Model, type ModelVersion, type PriceTier, type Pricing } from "@modelvend/admin-api/models";
import { DetailSection } from "@/components/shared/detail-section";
import { Field } from "@/components/shared/field";
import { InfoTip } from "@/components/shared/info-tip";
import { Pill } from "@/components/shared/pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isEditable, margin, marginTone, slugify } from "@/lib/catalog";
import { percent, unitPrice } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/labels";
import { usePermissions } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useModelAction } from "./use-model-action";
import { VersionBar } from "./version-picker";

const TONE_TEXT = {
  good: "",
  neutral: "text-muted-foreground",
  warning: "font-medium text-status-warning",
  critical: "font-medium text-status-critical",
} as const;

/** The price list as customers see it, with what each tier costs us. */
function PriceTable({ pricing }: { pricing: Pricing }) {
  const promo = pricing.promo ?? 0;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="pb-2 text-left font-medium">Tier</th>
          <th className="pb-2 text-right font-medium">Price per {UNIT_LABELS[pricing.unit]}</th>
          {promo > 0 && <th className="pb-2 text-right font-medium">With promo</th>}
          <th className="pb-2 text-right font-medium">Cost</th>
          <th className="pb-2 text-right font-medium">Margin</th>
        </tr>
      </thead>
      <tbody className="[&_td]:border-t [&_td]:py-2">
        {pricing.tiers.map((tier) => {
          const sold = tier.price * (1 - promo);
          const share = margin(sold, tier.cost);
          return (
            <tr key={tier.id}>
              <td>
                <span className="flex items-center gap-2">
                  {tier.label}
                  {tier.id === pricing.defaultTier && <Pill tone="info">Default</Pill>}
                </span>
              </td>
              <td className="text-right tabular">{unitPrice(tier.price)}</td>
              {promo > 0 && <td className="text-right tabular">{unitPrice(sold)}</td>}
              <td className="text-right tabular text-muted-foreground">{unitPrice(tier.cost)}</td>
              <td className={cn("text-right tabular", TONE_TEXT[marginTone(share)])}>{share === null ? "—" : percent(share)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface TierDraft {
  id: string;
  label: string;
  price: string;
  cost: number | null;
}

function PricingForm({ model, version }: { model: Model; version: ModelVersion }) {
  const run = useModelAction();
  const pricing = version.pricing;
  const [unit, setUnit] = useState<BillingUnit>(pricing.unit);
  const [tiers, setTiers] = useState<TierDraft[]>(pricing.tiers.map((t) => ({ ...t, price: String(t.price) })));
  const [defaultId, setDefaultId] = useState(pricing.defaultTier);
  const [promo, setPromo] = useState(pricing.promo ? String(Math.round(pricing.promo * 100)) : "");
  const [inputPrice, setInputPrice] = useState(pricing.input ? String(pricing.input.price) : "");
  const [saving, setSaving] = useState(false);

  const ids = tiers.map((t) => slugify(t.label));
  const problems: string[] = [];
  if (tiers.length === 0) problems.push("Add at least one tier.");
  if (tiers.some((t) => !t.label.trim())) problems.push("Every tier needs a label.");
  if (new Set(ids).size !== ids.length) problems.push("Tier labels must differ.");
  if (tiers.some((t) => !(Number(t.price) >= 0) || t.price === "")) problems.push("Prices are numbers of 0 or more.");
  if (promo && !(Number(promo) > 0 && Number(promo) < 100)) problems.push("Promo is a percentage between 1 and 99.");
  const defaultIndex = Math.max(0, tiers.findIndex((t) => t.id === defaultId));

  const next = (): Pricing => ({
    unit,
    defaultTier: ids[defaultIndex] ?? "",
    tiers: tiers.map(
      (t, i): PriceTier => ({ id: ids[i], label: t.label.trim(), price: Number(t.price), cost: t.cost }),
    ),
    input: inputPrice ? { unit: pricing.input?.unit ?? unit, price: Number(inputPrice) } : null,
    promo: promo ? Number(promo) / 100 : null,
  });
  const changed = JSON.stringify(next()) !== JSON.stringify(pricing);

  const update = (index: number, patch: Partial<TierDraft>) =>
    setTiers((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const save = async () => {
    setSaving(true);
    await run(() => updateVersion(model.id, version.id, { pricing: next() }), "Pricing saved", "Couldn't save the pricing");
    setSaving(false);
  };

  return (
    <DetailSection
      title="Edit pricing"
      action={
        <Button size="sm" disabled={!changed || problems.length > 0 || saving} onClick={() => void save()}>
          {saving && <LoaderCircle className="animate-spin" />}
          Save
        </Button>
      }
      bodyClassName="grid gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="unit" label="Billing unit" hint="What one unit of output is.">
          <Select value={unit} onValueChange={(value) => setUnit(value as BillingUnit)}>
            <SelectTrigger id="unit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BILLING_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  Per {UNIT_LABELS[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="promo" label="Launch promo %" hint="Off every tier; empty for none.">
          <Input id="promo" type="number" min={1} max={99} value={promo} onChange={(e) => setPromo(e.target.value)} />
        </Field>
        <Field id="input-price" label="Input price" hint="Per unit of reference media; empty for free.">
          <Input
            id="input-price"
            type="number"
            min={0}
            step="0.0001"
            value={inputPrice}
            onChange={(e) => setInputPrice(e.target.value)}
          />
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
          Tiers
          <InfoTip label="Tiers">
            Resolution or quality options with their own price. The request picks one; the default applies otherwise.
          </InfoTip>
        </legend>
        {tiers.map((tier, i) => (
          <div key={i} className="grid grid-cols-[auto_minmax(0,1fr)_8rem_auto] items-center gap-2">
            <input
              type="radio"
              name="default-tier"
              aria-label={`Make ${tier.label || "this tier"} the default`}
              checked={i === defaultIndex}
              onChange={() => setDefaultId(tier.id)}
              className="accent-[var(--brand)]"
            />
            <Input
              aria-label="Tier label"
              value={tier.label}
              placeholder="1080p"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <Input
              aria-label="Tier price"
              type="number"
              min={0}
              step="0.0001"
              value={tier.price}
              onChange={(e) => update(i, { price: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${tier.label || "tier"}`}
              disabled={tiers.length === 1}
              onClick={() => setTiers((list) => list.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setTiers((list) => [...list, { id: `tier-${list.length + 1}`, label: "", price: "", cost: null }])}
          >
            <Plus /> Add tier
          </Button>
        </div>
      </fieldset>
      {problems.length > 0 && changed && (
        <ul role="alert" className="list-inside list-disc text-xs text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}

/** What a version costs customers per unit, what it costs us, and the margin in between. */
export function PricingTab({
  model,
  version,
  onPick,
  onNewVersion,
}: {
  model: Model;
  version: ModelVersion;
  onPick: (id: string) => void;
  onNewVersion: () => void;
}) {
  const can = usePermissions();
  const editable = isEditable(version) && can.editCatalog;
  return (
    <div className="flex flex-col gap-4">
      <VersionBar model={model} version={version} onPick={onPick} />
      {!isEditable(version) && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          {version.status === "live" ? "Live" : "This"} version&apos;s price is frozen so callers are billed what they were quoted.
          {can.editCatalog && (
            <Button variant="link" size="xs" className="h-auto p-0" onClick={onNewVersion}>
              Create a new version to change it
            </Button>
          )}
        </p>
      )}
      <DetailSection title="Price list">
        <PriceTable pricing={version.pricing} />
        {version.pricing.input && (
          <p className="mt-3 text-xs text-muted-foreground">
            Plus {unitPrice(version.pricing.input.price)} per {UNIT_LABELS[version.pricing.input.unit]} of reference media.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Costs come from the first active route; the routing tab shows each route&apos;s margin. Failed requests and queue time
          aren&apos;t billed.
        </p>
      </DetailSection>
      {editable && <PricingForm key={`${version.id}:${JSON.stringify(version.pricing)}`} model={model} version={version} />}
    </div>
  );
}
