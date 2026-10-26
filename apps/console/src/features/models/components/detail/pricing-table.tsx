import { Check } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { mediumMeta, modalityLabel } from "@/lib/modality";
import { costOf, discounted, promoLabel, promoRate } from "@/lib/pricing";
import type { Model } from "@/types/model";

const perks = ["Failed tasks are never charged", "Bonus credits from $200 top-ups", "Test keys are billed the same as live keys"];

function exampleFor(model: Model) {
  if (model.modality === "video") return { units: 8, label: `8s clip at ${model.unitDetail}` };
  if (model.modality === "image") return { units: 1, label: `1 image at ${model.unitDetail}` };
  return { units: 1, label: `1 × ${model.unit}${model.unitDetail ? ` · ${model.unitDetail}` : ""}` };
}

function rowsFor(model: Model) {
  const tiers = model.tiers.map((t) => ({
    key: t.label,
    item: t.label,
    kind: `${modalityLabel[model.modality]} output`,
    unit: model.unit,
    list: t.price,
    isDefault: t.price === model.price,
  }));
  if (!model.inputPrice) return tiers;
  const inputKinds = model.inputs
    .filter((m) => m !== "text")
    .map((m) => mediumMeta[m].label)
    .join(" / ");
  return [
    ...tiers,
    {
      key: "input",
      item: "Reference",
      kind: `${inputKinds} input`,
      unit: model.inputPrice.unit,
      list: model.inputPrice.price,
      isDefault: false,
    },
  ];
}

export function PricingTable({ model }: { model: Model }) {
  const promo = promoRate(model);
  const example = exampleFor(model);

  return (
    <div className="grid gap-3 @6xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="rounded-[var(--radius-card)] border border-line p-4 sm:p-5">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[520px] text-[14px] [&_td]:px-3 [&_td]:py-[11px] [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:px-3 [&_th]:py-2.5 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
            <thead className="text-left text-[13px] text-muted">
              <tr>
                <th className="font-medium">Tier</th>
                <th className="font-medium">Billed per</th>
                <th className="text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {rowsFor(model).map((r) => (
                <tr key={r.key} className="border-t border-line">
                  <td>
                    <span className="font-medium text-fg">{r.item}</span>
                    <span className="ml-2 text-muted">{r.kind}</span>
                    {r.isDefault && <span className="ml-2 rounded-[4px] border border-line px-1 text-[11px] text-muted">default</span>}
                  </td>
                  <td className="text-muted">{r.unit}</td>
                  <td className="text-right tabular">
                    {promo > 0 ? (
                      <>
                        <s className="mr-1.5 text-[12px] text-subtle">{formatPrice(r.list)}</s>
                        <span className="text-deal">{formatPrice(discounted(model, r.list))}</span>
                      </>
                    ) : (
                      <span className="text-fg">{formatPrice(r.list)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col rounded-[var(--radius-card)] border border-line p-4">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Typical request</p>
          {promo > 0 && <span className="text-[12px] text-deal">{promoLabel(model)}</span>}
        </div>
        <p className="mt-2 text-[28px] leading-none font-semibold tracking-tight text-fg tabular">
          {formatPrice(costOf(model, example.units))}
          {promo > 0 && <s className="ml-2 text-[14px] font-normal text-subtle">{formatPrice(model.price * example.units)}</s>}
        </p>
        <p className="mt-1.5 text-[13px] text-muted">{example.label}</p>
        <ul className="mt-auto space-y-1.5 border-t border-line-soft pt-3 text-[13px] text-muted @max-6xl:mt-4">
          {perks.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Check className="size-3.5 text-ok" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
