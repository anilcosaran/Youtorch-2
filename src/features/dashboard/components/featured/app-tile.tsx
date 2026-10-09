import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { appHref } from "@/features/apps/lib/apps";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { discounted } from "@/lib/pricing";
import type { FeaturedApp } from "@/mocks/dashboard";
import { getModel } from "@/mocks/models";

const badgeTone: Record<NonNullable<FeaturedApp["badge"]>, string> = {
  Top: "bg-[#ff5e2b] text-[#fff]",
  New: "bg-[#7a66ee] text-[#fff]",
};

const sizes = "(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw";
const checker = "repeating-conic-gradient(#e4e4e7 0 25%, #fafafa 0 50%) 0 0 / 12px 12px";

export function AppTile({ app }: { app: FeaturedApp }) {
  const model = getModel(app.slug);
  const objectPosition = app.position ?? "50% 50%";
  const cutout = app.effect === "cutout";

  return (
    <Link
      href={appHref(app.app)}
      style={{ "--accent": app.accent } as CSSProperties}
      className={cn(
        "group relative isolate flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-3.5",
        "transition-[border-color,box-shadow] duration-300 hover:border-[color-mix(in_oklab,var(--accent)_55%,transparent)] hover:shadow-[0_18px_48px_-24px_var(--accent)]",
        cutout ? "motion-safe:animate-split" : "motion-safe:animate-upscale",
      )}
    >
      <Image src={app.image} alt="" fill sizes={sizes} className="-z-10 object-cover" style={{ objectPosition }} />
      {cutout && app.cutout && (
        <>
          {/* `--split` is animated on the tile so the clip edge and the divider move together. */}
          <div className="absolute inset-0 -z-10" style={{ background: checker, clipPath: "inset(0 0 0 var(--split))" }}>
            <Image src={app.cutout} alt="" fill sizes={sizes} className="object-cover" style={{ objectPosition }} />
          </div>
          <span className="pointer-events-none absolute inset-y-0 left-[var(--split)] -z-10 w-px bg-[rgb(255_255_255/0.9)] shadow-[0_0_8px_rgb(0_0_0/0.35)]" />
        </>
      )}
      {!cutout && (
        <>
          {/* `--scan` and friends are animated on the tile; everything right of the scan line is still blurry. */}
          <div
            className="absolute inset-0 -z-10 overflow-hidden"
            style={{ clipPath: "inset(0 0 0 var(--scan))", opacity: "var(--scan-blur)" }}
          >
            <Image src={app.image} alt="" fill sizes={sizes} className="scale-105 object-cover blur-[3px]" style={{ objectPosition }} />
          </div>
          <span
            className="pointer-events-none absolute inset-y-0 left-[var(--scan)] -z-10 w-px bg-[#fff] shadow-[0_0_10px_2px_rgb(255_255_255/0.55)]"
            style={{ opacity: "var(--scan-line)" }}
          />
        </>
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[rgb(0_0_0/0.8)] via-[rgb(0_0_0/0.2)] via-45% to-transparent to-75%" />

      <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#fff]">
        {cutout ? (
          <>
            <Chip>Original</Chip>
            <Chip>Cutout</Chip>
          </>
        ) : (
          <>
            <span />
            <Chip>4K</Chip>
          </>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="text-[16px] leading-tight font-semibold tracking-tight text-[#fff] [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]">
          {app.title}
          {app.badge && (
            <span
              className={cn(
                "ml-2 inline-block rounded px-1.5 py-px align-[2px] text-[10px] leading-normal font-semibold tracking-wide uppercase",
                badgeTone[app.badge],
              )}
            >
              {app.badge}
            </span>
          )}
          <ArrowRight className="ml-1.5 inline size-3.5 -translate-x-1 align-[-2px] opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
        </h3>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[rgb(255_255_255/0.78)]">{app.description}</p>
        <p className="mt-1.5 text-[11.5px] leading-snug text-[rgb(255_255_255/0.65)] tabular">
          {model.name} · from <span className="text-[#fff]">{formatPrice(discounted(model))}</span> / {model.unit}
        </p>
      </div>
    </Link>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("w-fit rounded-md bg-[rgb(0_0_0/0.45)] px-1.5 py-0.5 font-mono text-[10.5px] backdrop-blur-md", className)}>
      {children}
    </span>
  );
}
