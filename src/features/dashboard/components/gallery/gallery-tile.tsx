"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Play, Wand2 } from "lucide-react";
import { playgroundHref } from "@/features/models/lib/links";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { modalityIcon } from "@/lib/modality";
import { discounted } from "@/lib/pricing";
import type { GalleryShot } from "@/mocks/dashboard";
import { getModel } from "@/mocks/models";

export const gallerySizes = "(min-width: 1280px) 22vw, 50vw";

/**
 * One masonry tile. Each shot slowly zooms for `duration`, then `onDone` asks for
 * the next one, which crossfades in over the previous layer. Hover pauses the clock.
 */
export function GalleryTile({ shot, tall, duration, onDone }: { shot: GalleryShot; tall: boolean; duration: number; onDone: () => void }) {
  const [layers, setLayers] = useState([shot]);
  const [hovered, setHovered] = useState(false);
  if (layers.at(-1) !== shot) setLayers([...layers.slice(-1), shot]);

  const model = getModel(shot.slug);
  const Icon = modalityIcon[model.modality];
  const cost = discounted(model) * (shot.seconds ?? 1);

  return (
    <Link
      href={playgroundHref(model.slug, shot.prompt)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative mb-1.5 block break-inside-avoid overflow-hidden rounded-lg bg-surface"
    >
      <div className={cn("relative", tall ? "aspect-[3/4]" : "aspect-square")}>
        {layers.map((s, i) => {
          const top = i === layers.length - 1;
          return (
            <div
              key={s.image}
              className={cn("absolute inset-0", top && layers.length > 1 && "animate-fade-in")}
              onAnimationEnd={(e) => top && e.target === e.currentTarget && setLayers([s])}
            >
              <div
                className={cn("absolute inset-0 animate-ken-burns", hovered && "[animation-play-state:paused]")}
                style={{ animationDuration: `${duration}ms` }}
                onAnimationEnd={(e) => top && e.target === e.currentTarget && onDone()}
              >
                <Image src={s.image} alt={s.title} fill sizes={gallerySizes} className="object-cover" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[rgb(0_0_0/0.85)] via-[rgb(0_0_0/0.1)] to-[rgb(0_0_0/0.2)] opacity-75 transition-opacity duration-300 group-hover:opacity-100" />

      <div key={shot.image} className="absolute inset-0 animate-fade-in">
        <div className="absolute inset-x-2.5 top-2.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-[rgb(0_0_0/0.45)] px-1.5 py-0.5 text-[11.5px] font-medium text-[#fff] backdrop-blur-md [&_svg]:size-3">
            <Icon /> {model.name}
          </span>
          {shot.seconds && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[rgb(0_0_0/0.45)] px-1.5 py-0.5 font-mono text-[11px] text-[#fff] tabular backdrop-blur-md">
              <Play className="size-2.5 fill-current" /> 0:{String(shot.seconds).padStart(2, "0")}
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 text-[#fff]">
          <h3 className="text-[15px] font-semibold tracking-tight">{shot.title}</h3>
          <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-hover:grid-rows-[1fr]">
            <p className="line-clamp-2 overflow-hidden text-[12.5px] leading-snug text-[rgb(255_255_255/0.72)]">“{shot.prompt}”</p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] text-[rgb(255_255_255/0.7)] tabular">
              <span className="font-medium text-[#fff]">{formatPrice(cost)}</span>
              {shot.seconds ? ` · ${shot.seconds}s` : ` · 1 ${model.unit}`}
            </span>
            <span className="inline-flex translate-y-1 items-center gap-1 rounded-md bg-[#fff] px-2 py-1 text-[12px] font-medium text-[#0b0c0f] opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
              <Wand2 className="size-3" /> Remix
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
