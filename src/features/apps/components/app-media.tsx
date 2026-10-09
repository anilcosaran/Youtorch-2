import Image from "next/image";
import type { CSSProperties } from "react";
import { AudioPreview } from "@/components/media/audio-preview";
import { checkerboard, CompareSlider } from "@/components/media/compare-slider";
import { VideoPreview } from "@/components/media/video-preview";
import type { PlaygroundRun } from "@/features/models/lib/playground";
import { cn } from "@/lib/cn";
import type { App } from "@/mocks/apps";

const sizes = "(min-width: 1280px) 900px, 100vw";

/** Rough subject mask for uploads; the bundled sample ships a real cutout. */
const fakeCutout: CSSProperties = {
  maskImage: "radial-gradient(ellipse 34% 46% at 50% 52%, black 82%, transparent 84%)",
};

/** Fills its positioned parent. Uploaded files are data URLs, which skip the image optimizer. */
function Picture({
  src,
  alt,
  className,
  style,
  lowRes,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  lowRes?: boolean;
}) {
  if (src.startsWith("data:")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local upload, nothing to optimize
      <img src={src} alt={alt} className={cn("absolute inset-0 size-full object-cover", lowRes && "blur-[3px]", className)} style={style} />
    );
  }
  return <Image src={src} alt={alt} fill sizes={lowRes ? "96px" : sizes} className={cn("object-cover", className)} style={style} />;
}

/** The sample result in the app's hero, before anything is uploaded. */
export function AppShowcase({ app }: { app: App }) {
  const s = app.showcase;
  switch (s.kind) {
    case "compare":
      return (
        <CompareSlider
          sweep
          before={<Picture src={s.before} alt={`${app.name}, before`} lowRes={s.lowRes} />}
          after={
            <div className="absolute inset-0" style={s.transparent ? checkerboard : undefined}>
              <Picture src={s.after} alt={`${app.name}, after`} />
            </div>
          }
        />
      );
    case "video":
      return <VideoPreview src={s.image} alt={app.name} seconds={s.seconds} sizes={sizes} autoplay />;
    case "audio":
      return (
        <>
          <Picture src={s.image} alt="" />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(0_0_0/0.85)] via-[rgb(0_0_0/0.35)] to-transparent" />
          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-[rgb(255_255_255/0.12)] bg-[rgb(10_12_16/0.7)] p-4 text-left text-[#fff] backdrop-blur-xl sm:inset-x-6 sm:bottom-6">
            <p className="mb-3 line-clamp-2 text-[14px] leading-relaxed text-[rgb(255_255_255/0.85)]">“{s.script}”</p>
            <AudioPreview
              seconds={s.seconds}
              className="[--color-black:#0b0c0f] [--color-fg:#fff] [--color-muted:rgb(255_255_255/0.7)] [--color-white:#fff]"
            />
          </div>
        </>
      );
    case "gallery":
      return (
        <div className="absolute inset-0 grid grid-cols-2 gap-1">
          {s.images.map((src) => (
            <div key={src} className="relative overflow-hidden">
              <div className="absolute inset-0 motion-safe:animate-drift">
                <Picture src={src} alt={app.name} />
              </div>
            </div>
          ))}
        </div>
      );
  }
}

/** A finished run, shown in the style of the app's sample. */
export function AppResult({ app, run }: { app: App; run: PlaygroundRun }) {
  const s = app.showcase;
  const source = run.source;

  if (s.kind === "compare" && source) {
    const sample = source === s.before;
    const after =
      s.transparent && !sample ? (
        <div className="absolute inset-0" style={checkerboard}>
          <Picture src={source} alt="Result" style={fakeCutout} />
        </div>
      ) : (
        <div className="absolute inset-0" style={s.transparent ? checkerboard : undefined}>
          <Picture src={sample ? s.after : source} alt="Result" />
        </div>
      );
    return <CompareSlider before={<Picture src={source} alt="Original" lowRes={s.lowRes} />} after={after} />;
  }

  if (s.kind === "video") {
    return (
      <VideoPreview
        src={source ?? s.image}
        alt={run.prompt}
        seconds={Number.parseInt(String(run.values.duration)) || s.seconds}
        sizes={sizes}
        autoplay
      />
    );
  }

  if (s.kind === "audio") {
    return (
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-line bg-canvas p-5">
          <p className="mb-4 line-clamp-2 text-[14px] leading-relaxed text-fg/85">{run.prompt}</p>
          <AudioPreview seconds={s.seconds} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("absolute inset-0 grid gap-1", run.media.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
      {run.media.map((src, i) => (
        <div key={i} className="relative overflow-hidden">
          <Picture src={src} alt={run.prompt} />
        </div>
      ))}
    </div>
  );
}
