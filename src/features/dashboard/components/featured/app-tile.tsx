import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { playgroundHref } from "@/features/models/lib/links";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { discounted } from "@/lib/pricing";
import type { FeaturedApp } from "@/mocks/dashboard";
import { getModel } from "@/mocks/models";
import { CutoutLayer, EffectChips, MotionProgress, SplitHandle, UpscaleLayer, tileImageClass, tileSizes } from "./app-effects";

const badgeTone: Record<NonNullable<FeaturedApp["badge"]>, string> = {
  Top: "bg-[#ff5e2b] text-[#fff]",
  New: "bg-[#7a66ee] text-[#fff]",
};

export function AppTile({ app }: { app: FeaturedApp }) {
  const model = getModel(app.slug);
  const objectPosition = app.position ?? "50% 50%";
  const split = app.effect === "cutout" || app.effect === "upscale";

  return (
    <Link
      href={playgroundHref(model.slug, app.prompt)}
      style={{ "--accent": app.accent, animationDelay: app.effect === "upscale" ? "-3s" : undefined } as CSSProperties}
      className={cn(
        "group relative isolate flex min-h-[144px] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-3.5 transition-[border-color,box-shadow] duration-300",
        "hover:border-[color-mix(in_oklab,var(--accent)_60%,transparent)] hover:shadow-[0_18px_48px_-22px_var(--accent)]",
        split && "animate-split",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 -z-10",
          app.effect === "motion" && "animate-ken-burns [animation-direction:alternate] [animation-iteration-count:infinite]",
        )}
      >
        <Image src={app.image} alt="" fill sizes={tileSizes} className={tileImageClass} style={{ objectPosition }} />
      </div>
      {app.effect === "cutout" && app.cutout && <CutoutLayer src={app.cutout} objectPosition={objectPosition} />}
      {app.effect === "upscale" && <UpscaleLayer src={app.image} objectPosition={objectPosition} />}

      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[rgb(0_0_0/0.8)] via-[rgb(0_0_0/0.2)] via-45% to-transparent to-75%" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-gradient-to-t from-[color-mix(in_oklab,var(--accent)_45%,transparent)] to-transparent opacity-0 mix-blend-screen transition-opacity duration-500 group-hover:opacity-100" />

      {split && <SplitHandle />}
      {app.effect === "motion" && <MotionProgress />}

      <div className="absolute inset-x-3.5 top-3 flex items-center justify-between gap-2">
        {app.badge ? (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase shadow-[0_2px_10px_rgb(0_0_0/0.25)]",
              badgeTone[app.badge],
            )}
          >
            {app.badge}
          </span>
        ) : (
          <EffectChips effect={app.effect} side="start" />
        )}
        <EffectChips effect={app.effect} side="end" />
      </div>

      <h3 className="text-[16px] font-semibold tracking-tight text-[#fff] [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]">{app.title}</h3>
      <p className="mt-0.5 line-clamp-1 text-[12.5px] text-[rgb(255_255_255/0.78)]">{app.description}</p>
      <p className="mt-1.5 flex items-center justify-between text-[11.5px] text-[rgb(255_255_255/0.65)] tabular">
        <span>
          {model.name} · from <span className="text-[#fff]">{formatPrice(discounted(model))}</span> / {model.unit}
        </span>
        <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
      </p>
    </Link>
  );
}
