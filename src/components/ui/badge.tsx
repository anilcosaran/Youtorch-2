import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "ember" | "iris" | "jade" | "rose" | "glass";

const tones: Record<Tone, string> = {
  neutral: "bg-white/[0.06] text-muted border-line",
  ember: "bg-ember-500/12 text-ember-300 border-ember-500/25",
  iris: "bg-iris-500/14 text-iris-300 border-iris-500/25",
  jade: "bg-jade-500/12 text-jade-400 border-jade-500/25",
  rose: "bg-rose-400/12 text-rose-400 border-rose-400/25",
  glass: "bg-[rgb(0_0_0/0.45)] text-[#fff] border-[rgb(255_255_255/0.1)] backdrop-blur-md",
};

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[12px] font-medium tracking-wide [&_svg]:size-3",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
