import { Flame, Sparkles } from "lucide-react";
import { site } from "@/config/site";
import { ModelArt } from "@/features/models/components/model-art";
import { cn } from "@/lib/cn";
import { modalityIcon, modalityLabel } from "@/lib/modality";
import { madeBy } from "@/lib/model";
import { promoLabel } from "@/lib/pricing";
import type { Model } from "@/types/model";

const pill = "inline-flex h-7 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] text-white/90 backdrop-blur-md";

export function SlideBadges({ model }: { model: Model }) {
  const Icon = modalityIcon[model.modality];
  const promo = promoLabel(model, false);
  return (
    <div className="flex animate-fade-up flex-wrap items-center gap-2">
      <span className="inline-flex h-7 items-center gap-2 rounded-full bg-white/10 pr-3 pl-1 text-[13px] font-medium text-white backdrop-blur-md">
        <ModelArt model={model} className="size-5 rounded-full" />
        <span>{madeBy(model)}</span>
      </span>
      <span className={pill}>
        <Icon className="size-3.5" /> {modalityLabel[model.modality]}
      </span>
      {model.tags?.includes("original") && (
        <span className={cn(pill, "bg-ember-500/25 text-ember-200")}>
          <Sparkles className="size-3.5" /> {site.name} original
        </span>
      )}
      {model.tags?.includes("trending") && (
        <span className={pill}>
          <Flame className="size-3.5 text-ember-400" /> Trending
        </span>
      )}
      {promo && <span className={cn(pill, "bg-deal/20 font-semibold text-deal")}>{promo}</span>}
    </div>
  );
}
