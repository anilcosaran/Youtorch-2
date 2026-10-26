import Link from "next/link";
import { Wand2 } from "lucide-react";
import { AudioPreview } from "@/components/media/audio-preview";
import { playgroundHref } from "@/features/models/lib/links";
import { findModel } from "@/mocks/models";
import { elevenSpotlight, type SpotlightVoice } from "@/mocks/spotlights";
import { SpotlightHeader } from "./spotlight-header";

/** A few voices with their script and a playable sample; "Use this voice" carries the script into the playground. */
export function ElevenSpotlight() {
  const { slug, tagline, accent, items } = elevenSpotlight;
  const model = findModel(slug);
  if (!model) return null;

  return (
    <section>
      <SpotlightHeader model={model} tagline={tagline} accent={accent} />
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((voice) => (
          <VoiceCard key={voice.name} voice={voice} href={playgroundHref(model.slug, voice.script)} />
        ))}
      </div>
    </section>
  );
}

function VoiceCard({ voice, href }: { voice: SpotlightVoice; href: string }) {
  return (
    <article className="flex flex-col surface p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-[#fff]"
          style={{ background: `linear-gradient(135deg, ${voice.colors[0]}, ${voice.colors[1]})` }}
        >
          {voice.name[0]}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-semibold text-fg">{voice.name}</h3>
          <p className="truncate text-[12.5px] text-muted">{voice.style}</p>
        </div>
        <span className="rounded-md border border-line px-2 py-0.5 text-[12px] text-muted">{voice.language}</span>
      </div>
      <p className="mt-3.5 line-clamp-2 min-h-[2lh] flex-1 text-[14px] leading-relaxed text-fg/85">
        <Script text={voice.script} />
      </p>
      <AudioPreview seconds={voice.seconds} compact className="mt-3" />
      <Link href={href} className="mt-3 inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-fg">
        <Wand2 className="size-3.5" /> Use this voice
      </Link>
    </article>
  );
}

function Script({ text }: { text: string }) {
  return text.split(/(\[[^\]]+\])/).map((part, i) =>
    part.startsWith("[") ? (
      <span key={i} className="rounded bg-iris-500/15 px-1 py-px font-mono text-[12px] text-iris-300">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
