"use client";

import Image from "next/image";
import { site } from "@/config/site";
import { SectionHeader, SectionLink } from "@/components/ui/section-header";
import { galleryShots } from "@/mocks/dashboard";
import { GalleryTile, gallerySizes } from "./gallery-tile";
import { useShotRotation } from "./use-shot-rotation";

/** Tall (3:4) and square slots, paired in column order so every masonry column ends level. */
const slots = [true, false, false, true, true, false, false, true];

export function Gallery() {
  const { shown, queued, advance } = useShotRotation(slots.length, galleryShots.length);

  return (
    <section>
      <SectionHeader
        title={`Made on ${site.name}`}
        description="Real outputs with the exact prompt and what they cost. Remix any of them in the playground."
        action={<SectionLink href="/models">All models</SectionLink>}
      />
      <div className="columns-2 gap-1.5 xl:columns-4">
        {slots.map((tall, slot) => (
          <GalleryTile
            key={slot}
            shot={galleryShots[shown[slot]]}
            tall={tall}
            duration={6500 + ((slot * 2300) % 5200)}
            onDone={() => advance(slot)}
          />
        ))}
      </div>
      {/* Warm the cache for upcoming shots so crossfades never reveal an empty frame. */}
      <div aria-hidden className="pointer-events-none fixed top-0 left-0 size-px overflow-hidden opacity-0">
        {queued.map((i) => (
          <div key={galleryShots[i].image} className="relative size-px">
            <Image src={galleryShots[i].image} alt="" fill sizes={gallerySizes} loading="eager" />
          </div>
        ))}
      </div>
    </section>
  );
}
