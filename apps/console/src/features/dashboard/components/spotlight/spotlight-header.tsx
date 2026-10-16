import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { playgroundHref } from "@/features/models/lib/links";
import type { Model } from "@/types/model";

/** Big uppercase model name in the model's own gradient, the way creative galleries title a model drop. */
export function SpotlightHeader({ model, tagline, accent }: { model: Model; tagline: string; accent: [string, string] }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h2
          className="w-fit bg-clip-text text-[clamp(26px,2.6vw,36px)] leading-none font-black tracking-[-0.03em] text-transparent uppercase"
          style={{ backgroundImage: `linear-gradient(90deg, ${accent[0]}, ${accent[1]})` }}
        >
          {model.name}
        </h2>
        <p className="mt-2 max-w-2xl text-[14px] text-muted">{tagline}</p>
      </div>
      <Link href={playgroundHref(model.slug)} className={buttonClass({ variant: "outline", size: "sm" })}>
        Try {model.name} <ArrowRight />
      </Link>
    </div>
  );
}
