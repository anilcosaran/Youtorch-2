import Image from "next/image";
import Link from "next/link";
import { Play, Wand2 } from "lucide-react";
import { VideoPreview } from "@/components/media/video-preview";
import { playgroundHref } from "@/features/models/lib/links";
import { formatPrice } from "@/lib/format";
import { costOf } from "@/lib/pricing";
import { findModel } from "@/mocks/models";
import { lumenSpotlight, type SpotlightClip } from "@/mocks/spotlights";
import type { Model } from "@/types/model";
import { SpotlightHeader } from "./spotlight-header";

const glass = "rounded-md bg-[rgb(0_0_0/0.45)] px-1.5 py-0.5 text-[11.5px] font-medium text-[#fff] backdrop-blur-md";

/** One playable hero clip and two smaller ones that open in the playground with their prompt. */
export function LumenSpotlight() {
  const { slug, tagline, accent, items } = lumenSpotlight;
  const model = findModel(slug);
  const [hero, ...rest] = items;
  if (!model || !hero) return null;

  return (
    <section>
      <SpotlightHeader model={model} tagline={tagline} accent={accent} />
      <div className="grid gap-1.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="relative aspect-video overflow-hidden rounded-lg">
          <VideoPreview src={hero.image} alt={hero.title} seconds={hero.seconds} sizes="(min-width: 1024px) 60vw, 100vw" autoplay />
          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
            <div className="min-w-0 text-[#fff]">
              <p className="text-[15px] font-semibold tracking-tight [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]">{hero.title}</p>
              <p className="mt-0.5 line-clamp-1 max-w-md text-[12.5px] text-[rgb(255_255_255/0.75)] [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]">
                “{hero.prompt}”
              </p>
            </div>
            <RemixLink model={model} clip={hero} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1 lg:grid-rows-2">
          {rest.map((clip) => (
            <ClipTile key={clip.title} model={model} clip={clip} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RemixLink({ model, clip }: { model: Model; clip: SpotlightClip }) {
  return (
    <Link
      href={playgroundHref(model.slug, clip.prompt)}
      className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-md bg-[#fff] px-2 py-1 text-[12px] font-medium text-[#0b0c0f] transition hover:bg-[rgb(255_255_255/0.88)]"
    >
      <Wand2 className="size-3" /> Remix · {formatPrice(costOf(model, clip.seconds))}
    </Link>
  );
}

/** Rows stretch to the hero's height on wide screens, so these drop their own aspect ratio there. */
function ClipTile({ model, clip }: { model: Model; clip: SpotlightClip }) {
  return (
    <Link
      href={playgroundHref(model.slug, clip.prompt)}
      className="group relative block aspect-video overflow-hidden rounded-lg bg-surface lg:aspect-auto"
    >
      <Image
        src={clip.image}
        alt={clip.title}
        fill
        sizes="(min-width: 1024px) 30vw, 50vw"
        className="object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.05]"
        style={{ objectPosition: clip.position }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[rgb(0_0_0/0.8)] via-transparent to-transparent" />
      <span className={`absolute top-2.5 right-2.5 inline-flex items-center gap-1 font-mono tabular ${glass}`}>
        <Play className="size-2.5 fill-current" /> 0:{String(clip.seconds).padStart(2, "0")}
      </span>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 text-[#fff]">
        <h3 className="min-w-0 truncate text-[14.5px] font-semibold tracking-tight">{clip.title}</h3>
        <span className="inline-flex shrink-0 translate-y-1 items-center gap-1 rounded-md bg-[#fff] px-2 py-1 text-[12px] font-medium text-[#0b0c0f] opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <Wand2 className="size-3" /> Remix
        </span>
      </div>
    </Link>
  );
}
