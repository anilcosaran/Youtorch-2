"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Lock, Plus, X } from "lucide-react";
import { BILLING_UNITS, updateVersion, type BillingUnit, type Model, type ModelVersion, type Pricing, type PricingInput } from "@modelvend/admin-api/models";
import { DetailSection } from "@/components/shared/detail-section";
import { Field } from "@/components/shared/field";
import { InfoTip } from "@/components/shared/info-tip";
import { Pill } from "@/components/shared/pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isDecimal, isEditable, marginTone, parseJsonObject, slugify, soldPrice, tierMargin } from "@/lib/catalog";
import { percent, plural, unitPrice } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/labels";
import { usePermissions } from "@/lib/session";
import { useSettings } from "@/lib/use-settings";
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
  const { minMargin } = useSettings();
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
          const sold = soldPrice(pricing, tier.price);
          const share = tierMargin(pricing, tier, tier.cost);
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
              <td className={cn("text-right tabular", TONE_TEXT[marginTone(share, minMargin)])}>{share === null ? "—" : percent(share)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface TierDraft {
  /** Tells rows apart on screen while their label is being typed. */
  key: number;
  /** A saved tier keeps its ID, since route costs are filed under it; a new one takes it from its label. */
  id: string | null;
  label: string;
  price: string;
}

/** The part of a version's pricing the server takes back: tier costs are read-only. */
const toInput = (pricing: Pricing): PricingInput => ({
  unit: pricing.unit,
  defaultTier: pricing.defaultTier,
  tierField: pricing.tierField,
  tierValues: pricing.tierValues,
  input: pricing.input && { unit: pricing.input.unit, price: pricing.input.price, field: pricing.input.field },
  promo: pricing.promo,
  tiers: pricing.tiers.map((tier) => ({ id: tier.id, label: tier.label, price: tier.price })),
});

function PricingForm({ model, version }: { model: Model; version: ModelVersion }) {
  const run = useModelAction(model.id);
  const pricing = version.pricing;
  const [unit, setUnit] = useState<BillingUnit>(pricing.unit);
  const [tiers, setTiers] = useState<TierDraft[]>(() => pricing.tiers.map((t, key) => ({ key, id: t.id, label: t.label, price: t.price })));
  const nextKey = useRef(pricing.tiers.length);
  const [defaultKey, setDefaultKey] = useState(() => Math.max(0, pricing.tiers.findIndex((t) => t.id === pricing.defaultTier)));
  const [tierField, setTierField] = useState(pricing.tierField ?? "");
  const [tierValues, setTierValues] = useState(Object.keys(pricing.tierValues).length > 0 ? JSON.stringify(pricing.tierValues, null, 2) : "");
  // Exact, so a 12.5% promo reloads as 12.5 and saving again doesn't change the price.
  const [promo, setPromo] = useState(pricing.promo ? String(Number((pricing.promo * 100).toFixed(4))) : "");
  const [inputPrice, setInputPrice] = useState(pricing.input?.price ?? "");
  const [inputUnit, setInputUnit] = useState<BillingUnit>(pricing.input?.unit ?? pricing.unit);
  const [inputField, setInputField] = useState(pricing.input?.field ?? "");
  const [saving, setSaving] = useState(false);

  const ids = tiers.map((t) => t.id ?? slugify(t.label));
  const parsedValues = tierValues.trim() ? parseJsonObject(tierValues, "Tier values") : { value: {} };
  const values = "value" in parsedValues ? parsedValues.value : {};
  const problems: string[] = [];
  if (tiers.length === 0) problems.push("Add at least one tier.");
  if (tiers.some((t, i) => !t.label.trim() || !ids[i])) problems.push("Every tier needs a label with letters or digits.");
  if (new Set(ids).size !== ids.length) problems.push("Tier labels must differ.");
  if (tiers.some((t) => !isDecimal(t.price.trim()))) problems.push("Prices are digits with a dot for decimals, such as 0.084.");
  if (promo && !(Number(promo) > 0 && Number(promo) <= 99)) problems.push("Promo is a percentage above 0 and at most 99.");
  if (inputPrice.trim() && !isDecimal(inputPrice.trim())) problems.push("The input price is digits with a dot for decimals, such as 0.04.");
  if (Boolean(inputPrice.trim()) !== Boolean(inputField.trim())) problems.push("An input price needs both the price and the input field that holds the media.");
  if ("error" in parsedValues) problems.push(parsedValues.error);
  else if (Object.values(values).some((tier) => typeof tier !== "string" || !ids.includes(tier))) {
    problems.push("Tier values map each value of the tier field to the ID of a tier.");
  }
  const defaultIndex = Math.max(0, tiers.findIndex((t) => t.key === defaultKey));

  const next = (): PricingInput => ({
    unit,
    defaultTier: ids[defaultIndex] ?? "",
    tierField: tierField.trim() || null,
    tierValues: values as Record<string, string>,
    input: inputPrice.trim() ? { unit: inputUnit, price: inputPrice.trim(), field: inputField.trim() } : null,
    // Percent to a share, kept to six decimals: 12.5 → 0.125.
    promo: promo ? Math.round(Number(promo) * 10_000) / 1_000_000 : null,
    tiers: tiers.map((t, i) => ({ id: ids[i], label: t.label.trim(), price: t.price.trim() })),
  });
  const changed = JSON.stringify(next()) !== JSON.stringify(toInput(pricing));
  // The numbers on the routes meant the old unit, so the server clears them.
  const clearsCosts = unit !== pricing.unit && version.routes.length > 0;

  const update = (index: number, patch: Partial<TierDraft>) =>
    setTiers((list) => list.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const save = async () => {
    setSaving(true);
    await run(() => updateVersion(model.id, version.id, model.revision, { pricing: next() }), "Pricing saved", "Couldn't save the pricing");
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
      <div className="grid gap-4 sm:grid-cols-2">
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
        <Field id="promo" label="Launch promo %" hint="Off every tier, not the input price; empty for none.">
          <Input id="promo" type="number" min={0} max={99} step="any" value={promo} onChange={(e) => setPromo(e.target.value)} />
        </Field>
      </div>
      {clearsCosts && (
        <p role="alert" className="rounded-lg bg-status-warning/10 px-3 py-2 text-xs">
          Saving clears the tier costs of {plural(version.routes.length, "route")}, as they are per {UNIT_LABELS[pricing.unit]}. Enter them
          again per {UNIT_LABELS[unit]} on the Routing tab; publishing asks for them.
        </p>
      )}
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
          Input price
          <InfoTip label="Input price">Charged for reference media on top of the tier. Promos don&apos;t apply to it. Empty for free.</InfoTip>
        </legend>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <Input
            aria-label="Input price"
            inputMode="decimal"
            placeholder="0.04"
            value={inputPrice}
            onChange={(e) => setInputPrice(e.target.value)}
          />
          <Select value={inputUnit} onValueChange={(value) => setInputUnit(value as BillingUnit)}>
            <SelectTrigger aria-label="Input price unit" className="w-36">
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
          <Input
            aria-label="Input field that holds the media"
            placeholder="Input field, e.g. image_urls"
            value={inputField}
            onChange={(e) => setInputField(e.target.value)}
            className="font-mono"
          />
        </div>
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
          Tiers
          <InfoTip label="Tiers">
            Resolution or quality options with their own price. The input picks one through the tier field; the default applies otherwise.
          </InfoTip>
        </legend>
        {tiers.map((tier, i) => (
          <div key={tier.key} className="grid grid-cols-[auto_minmax(0,1fr)_8rem_auto] items-center gap-2">
            <input
              type="radio"
              name="default-tier"
              aria-label={`Make ${tier.label || "this tier"} the default`}
              checked={i === defaultIndex}
              onChange={() => setDefaultKey(tier.key)}
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
              inputMode="decimal"
              value={tier.price}
              placeholder="0.084"
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
            onClick={() => {
              const key = nextKey.current++;
              setTiers((list) => [...list, { key, id: null, label: "", price: "" }]);
            }}
          >
            <Plus /> Add tier
          </Button>
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tier-field" label="Tier field" hint="The input field whose value picks the tier, such as resolution. Empty when every task bills the default.">
          <Input id="tier-field" value={tierField} onChange={(e) => setTierField(e.target.value)} className="font-mono" />
        </Field>
        <Field id="tier-values" label="Tier values" hint={`Values of the field that aren't tier IDs themselves, mapped to one: {"4k": "${ids[0] || "tier"}"}. Tier IDs: ${ids.filter(Boolean).join(", ")}.`}>
          <Textarea
            id="tier-values"
            value={tierValues}
            spellCheck={false}
            onChange={(e) => setTierValues(e.target.value)}
            aria-invalid={"error" in parsedValues}
            className="min-h-16 font-mono text-xs md:text-xs"
          />
        </Field>
      </div>
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
  const { minMargin } = useSettings();
  const editable = isEditable(version) && can.editPrices;
  const { pricing } = version;
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
      {isEditable(version) && !can.editPrices && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Changing prices needs the Set prices permission.
        </p>
      )}
      <DetailSection title="Price list">
        <PriceTable pricing={pricing} />
        {pricing.tierField && (
          <p className="mt-3 text-xs text-muted-foreground">
            The input field <code className="font-mono">{pricing.tierField}</code> picks the tier
            {Object.keys(pricing.tierValues).length > 0 && (
              <>
                {" "}
                ({Object.entries(pricing.tierValues).map(([value, tier]) => `${value} → ${tier}`).join(", ")})
              </>
            )}
            .
          </p>
        )}
        {pricing.input && (
          <p className="mt-3 text-xs text-muted-foreground">
            Plus {unitPrice(pricing.input.price)} per {UNIT_LABELS[pricing.input.unit]} of reference media in{" "}
            <code className="font-mono">{pricing.input.field}</code>.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Costs come from the primary route, per tier; the routing tab shows each route&apos;s margin. A tier under the {percent(minMargin, 0)} minimum
          margin needs a reason to publish. Failed tasks and queue time aren&apos;t billed.
        </p>
      </DetailSection>
      {editable && <PricingForm key={`${version.id}:${JSON.stringify(pricing)}`} model={model} version={version} />}
    </div>
  );
}
