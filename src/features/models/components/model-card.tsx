import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, Flame, Sparkles, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { site } from "@/config/site";
import { cn } from "@/lib/cn";
import { modalityIcon, modalityLabel } from "@/lib/modality";
import { discounted } from "@/lib/pricing";
import type { Model } from "@/types/model";
import { modelHref } from "../lib/links";
import { ModelArt } from "./model-art";

export function ModelCard({ model, className, style }: { model: Model; className?: string; style?: CSSProperties }) {
  const Icon = modalityIcon[model.modality];
  return (
    <Link
      href={modelHref(model.slug)}
      style={style}
      className={cn("group flex flex-col overflow-hidden surface transition-colors duration-300 hover:border-line-strong", className)}
    >
      <div className="relative m-1.5 mb-0 overflow-hidden rounded-[10px]">
        <ModelArt model={model} className="aspect-[16/9]" />
        <div className="absolute inset-x-2.5 top-2.5 flex items-center gap-1.5">
          <Badge tone="glass">
            <Icon /> {modalityLabel[model.modality]}
          </Badge>
          {model.tags?.includes("original") && (
            <Badge tone="glass" className="text-[#ffc7b0]">
              <Sparkles /> {site.name} original
            </Badge>
          )}
          {model.tags?.includes("trending") && (
            <Badge tone="glass">
              <Flame className="text-ember-400" /> Trending
            </Badge>
          )}
          {model.tags?.includes("new") && !model.tags.includes("original") && <Badge tone="glass">New</Badge>}
        </div>
        <div className="absolute right-2.5 bottom-2.5 grid size-8 translate-y-1 place-items-center rounded-full bg-white text-canvas opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-[16px] font-bold tracking-tight">{model.name}</h3>
          <span className="shrink-0 font-mono text-[11px] tracking-wider text-subtle uppercase">{model.provider}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-muted">{model.description}</p>
        <div className="mt-auto flex items-center justify-between pt-3.5 text-[13px]">
          <span className="text-muted tabular">
            {model.promo ? (
              <>
                <s className="mr-1 text-[12px] text-subtle">${model.price.toFixed(3)}</s>
                <span className="font-medium text-deal">${discounted(model).toFixed(3)}</span>
              </>
            ) : (
              <span className="font-medium text-fg">${model.price.toFixed(3)}</span>
            )}
            <span className="text-subtle"> per {model.unit}</span>
            {model.promo && <span className="ml-1.5 text-[12px] text-deal">{Math.round(model.promo * 100)}% off</span>}
          </span>
          <span className="flex items-center gap-1 text-subtle">
            <Timer className="size-3.5" />
            {model.latency}
          </span>
        </div>
      </div>
    </Link>
  );
}
