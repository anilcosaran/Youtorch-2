"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { modelHref, playgroundHref } from "@/features/models/lib/links";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { discounted, promoRate } from "@/lib/pricing";
import { showcaseSlides } from "@/mocks/dashboard";
import { findModel } from "@/mocks/models";
import type { Model } from "@/types/model";
import { SlideBadges } from "./slide-badges";
import { SliderProgress } from "./slider-progress";

const SLIDE_MS = 7000;
const edgeFade = "linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%)";

const slides = showcaseSlides
  .map((s) => ({ ...s, model: findModel(s.slug) }))
  .filter((s): s is (typeof showcaseSlides)[number] & { model: Model } => !!s.model);

/** Full-bleed hero carousel; advances on its own and keeps running under the pointer. */
export function ShowcaseSlider() {
  const [index, setIndex] = useState(0);
  const go = useCallback((next: number) => setIndex((next + slides.length) % slides.length), []);
  if (!slides.length) return null;
  const { model, headline } = slides[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured models"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(index - 1);
        if (e.key === "ArrowRight") go(index + 1);
      }}
      className="relative isolate h-[clamp(400px,58vh,580px)] overflow-hidden"
    >
      <div className="absolute inset-0" style={{ maskImage: edgeFade, WebkitMaskImage: edgeFade }}>
        {slides.map((s, i) => (
          <div
            key={s.slug}
            aria-hidden={i !== index}
            className={cn("absolute inset-0 transition-opacity duration-1000 ease-out", i === index ? "opacity-100" : "opacity-0")}
          >
            <div key={i === index ? `on-${index}` : "off"} className={cn("absolute inset-0", i === index && "animate-ken-burns")}>
              {s.video ? (
                <video src={s.video} poster={s.image} autoPlay muted loop playsInline className="size-full object-cover" />
              ) : (
                <Image src={s.image} alt="" fill loading={i === 0 ? "eager" : "lazy"} sizes="100vw" className="object-cover" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-canvas/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-canvas/80 via-canvas/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-canvas via-canvas/60 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:px-6 lg:px-8">
        <div key={index} className="max-w-xl">
          <SlideBadges model={model} />
          <h2
            className="mt-4 animate-fade-up text-[clamp(34px,4.2vw,56px)] leading-[1.02] font-semibold tracking-[-0.035em] text-white"
            style={{ animationDelay: "60ms" }}
          >
            {model.name}
          </h2>
          <p className="mt-2 animate-fade-up text-[17px] font-medium text-white/90" style={{ animationDelay: "110ms" }}>
            {headline}
          </p>
          <p className="mt-1.5 line-clamp-2 animate-fade-up text-[15px] leading-relaxed text-white/70" style={{ animationDelay: "150ms" }}>
            {model.description}
          </p>
          <div className="mt-5 flex animate-fade-up flex-wrap items-center gap-3" style={{ animationDelay: "200ms" }}>
            <Link href={modelHref(model.slug)} className={buttonClass({ variant: "primary", size: "lg" })}>
              Explore model <ArrowRight />
            </Link>
            <Link
              href={playgroundHref(model.slug)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-white/10 px-4 text-[14px] font-medium text-white backdrop-blur-md transition hover:bg-white/20"
            >
              <Play className="size-4" /> Try it
            </Link>
            <span className="text-[14px] text-white/75 tabular">
              from {promoRate(model) > 0 && <s className="mr-1 text-white/45">{formatPrice(model.price)}</s>}
              <span className="font-semibold text-white">{formatPrice(discounted(model))}</span> / {model.unit}
            </span>
          </div>
        </div>

        <SliderProgress
          labels={slides.map((s) => s.model.name)}
          index={index}
          duration={SLIDE_MS}
          onSelect={go}
          onComplete={() => go(index + 1)}
        />
      </div>
    </section>
  );
}
