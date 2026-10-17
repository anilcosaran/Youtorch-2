import type { CSSProperties } from "react";
import Image from "next/image";
import { Check, Type, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { modalityIcon } from "@/lib/modality";
import type { FlowStep } from "@/mocks/canvas";
import { getModel } from "@/mocks/models";
import { stepCost } from "../lib/flow";

export const stepKinds: Record<FlowStep["kind"], { label: string; icon: LucideIcon }> = {
  prompt: { label: "Prompt", icon: Type },
  image: { label: "Image", icon: modalityIcon.image },
  video: { label: "Video", icon: modalityIcon.video },
  voice: { label: "Voice", icon: modalityIcon.audio },
};

const wave = Array.from({ length: 30 }, (_, i) => Math.round(22 + Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.31)) * 78));

/** One step on a Canvas board: what it makes, which model runs it and what it costs per run. */
export function FlowNode({ step, className, style }: { step: FlowStep; className?: string; style?: CSSProperties }) {
  const { label, icon: Icon } = stepKinds[step.kind];
  const model = step.slug ? getModel(step.slug) : undefined;
  const running = step.progress !== undefined;

  return (
    <div
      className={cn(
        "w-[208px] rounded-xl border border-line-strong bg-raised/90 p-2 shadow-2xl shadow-black/40 backdrop-blur-md",
        className,
      )}
      style={style}
    >
      <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-2 text-[12px]">
        <Icon className="size-3.5 shrink-0 text-muted" />
        <span className="font-medium text-fg">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-muted">{model?.name}</span>
      </div>

      {step.kind === "prompt" && (
        <p className="rounded-lg bg-white/[0.05] px-2.5 py-2 text-[12.5px] leading-snug text-fg/85">“{step.text}”</p>
      )}
      {step.kind === "image" && step.image && (
        <div className="grid grid-cols-2 gap-1">
          {["30% 50%", "70% 50%"].map((position) => (
            <div key={position} className="relative aspect-square overflow-hidden rounded-md">
              <Image src={step.image!} alt="" fill sizes="100px" className="object-cover" style={{ objectPosition: position }} />
            </div>
          ))}
        </div>
      )}
      {step.kind === "video" && step.image && (
        <div className="relative aspect-video overflow-hidden rounded-md">
          <div className="absolute inset-0 motion-safe:[animation:ken-burns_9s_ease-in-out_infinite_alternate]">
            <Image src={step.image} alt="" fill sizes="200px" className="object-cover" />
          </div>
          {running && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-[rgb(0_0_0/0.45)]">
              <span className="block h-full bg-[#fff]" style={{ width: `${step.progress}%` }} />
            </span>
          )}
        </div>
      )}
      {step.kind === "voice" && (
        <div className="rounded-lg bg-white/[0.05] px-2.5 py-2">
          <div aria-hidden className="flex h-7 items-center gap-[2px]">
            {wave.map((height, i) => (
              <span key={i} className={cn("flex-1 rounded-full", i < 18 ? "bg-fg/80" : "bg-fg/25")} style={{ height: `${height}%` }} />
            ))}
          </div>
          <p className="mt-1.5 line-clamp-1 text-[12px] text-muted">{step.text}</p>
        </div>
      )}

      <div className="mt-2 flex items-center gap-1.5 px-1 pb-0.5 text-[11.5px] text-muted">
        <span className="min-w-0 flex-1 truncate">{step.note}</span>
        {running ? (
          <span className="inline-flex items-center gap-1.5 text-fg tabular">
            <span className="size-1.5 animate-pulse-soft rounded-full bg-iris-300" />
            {step.progress}%
          </span>
        ) : (
          model && (
            <span className="inline-flex items-center gap-1 tabular">
              <Check className="size-3 text-ok" />
              {formatPrice(stepCost(step))}
            </span>
          )
        )}
      </div>
    </div>
  );
}
