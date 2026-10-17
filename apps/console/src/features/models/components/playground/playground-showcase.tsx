import Image from "next/image";
import { AudioPreview } from "@/components/media/audio-preview";
import { VideoPreview } from "@/components/media/video-preview";
import { cn } from "@/lib/cn";
import type { Model } from "@/types/model";
import type { PlaygroundExample } from "../../lib/examples";

const sizes = "(min-width: 1280px) 860px, 100vw";

/** One sample result at full size: a player for video and audio, the still for image and 3D. */
export function PlaygroundShowcase({ model, example }: { model: Model; example: PlaygroundExample }) {
  if (model.modality === "audio" || !example.image) {
    return (
      <div className="w-full max-w-2xl animate-[fade-in_250ms_ease-out] rounded-2xl border border-line bg-canvas p-5">
        <p className="mb-4 flex items-center gap-2 text-[13px] text-muted">
          <ExampleBadge /> {example.title}
        </p>
        <AudioPreview key={example.id} seconds={example.seconds ?? 8} />
      </div>
    );
  }

  const ratio = 16 / 9;
  return (
    <div
      key={example.id}
      className="relative animate-[fade-in_250ms_ease-out] overflow-hidden rounded-xl border border-line bg-canvas"
      style={{ aspectRatio: ratio, width: `min(100cqw, ${ratio} * 100cqh)` }}
    >
      {model.modality === "video" ? (
        <VideoPreview src={example.image} alt={example.title} seconds={example.seconds ?? 5} sizes={sizes} autoplay />
      ) : (
        <div className={model.modality === "3d" ? "absolute inset-0 motion-safe:animate-drift" : "absolute inset-0"}>
          <Image src={example.image} alt={example.title} fill sizes={sizes} className="object-cover" />
        </div>
      )}
      <span className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-[rgb(0_0_0/0.5)] py-1 pr-2.5 pl-1 text-[12.5px] font-medium text-[#fff] backdrop-blur-md">
        <ExampleBadge onMedia /> {example.title}
      </span>
    </div>
  );
}

/** `onMedia` keeps the badge white over pictures in both themes. */
function ExampleBadge({ onMedia }: { onMedia?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-px text-[11px] font-semibold tracking-wide uppercase",
        onMedia ? "bg-[rgb(255_255_255/0.16)] text-[#fff]" : "bg-white/[0.08] text-fg",
      )}
    >
      Example
    </span>
  );
}
