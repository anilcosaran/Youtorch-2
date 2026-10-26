import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { checkerboard } from "@/components/media/compare-slider";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { App } from "@/mocks/apps";
import { appHref } from "../lib/apps";

const badgeTone: Record<NonNullable<App["badge"]>, string> = {
  Top: "bg-[#ff5e2b] text-[#fff]",
  New: "bg-[#7a66ee] text-[#fff]",
};

const sizes = "(min-width: 1280px) 560px, (min-width: 640px) 50vw, 100vw";

/** Cover shows the input; hovering a before/after app reveals its result. `eager` for covers above the fold. */
export function AppCard({ app, eager }: { app: App; eager?: boolean }) {
  const s = app.showcase;
  const reveal = s.kind === "compare" ? s : undefined;

  return (
    <Link
      href={appHref(app.slug)}
      className="group block overflow-hidden rounded-2xl border border-line bg-surface/40 transition-[border-color,background-color] duration-300 hover:border-line-strong hover:bg-surface"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-canvas">
        <Image
          src={app.cover}
          alt={app.name}
          fill
          loading={eager ? "eager" : "lazy"}
          sizes={reveal?.lowRes ? "64px" : sizes}
          className="object-cover transition duration-700 group-hover:scale-[1.03]"
          style={{ objectPosition: app.position }}
        />
        {reveal && (
          <div
            className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={reveal.transparent ? checkerboard : undefined}
          >
            <Image src={reveal.after} alt="" fill sizes={sizes} className="object-cover" style={{ objectPosition: app.position }} />
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-md bg-[rgb(0_0_0/0.5)] px-2 py-0.5 text-[12px] font-medium text-[#fff] backdrop-blur-md">
          {app.category}
        </span>
        {app.badge && (
          <span
            className={cn(
              "absolute top-3 right-3 rounded px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide uppercase",
              badgeTone[app.badge],
            )}
          >
            {app.badge}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15.5px] font-semibold tracking-tight text-fg">{app.name}</h3>
          <ArrowRight className="size-4 shrink-0 -translate-x-1 text-fg opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
        <p className="mt-1 truncate text-[13.5px] text-muted">{app.tagline}</p>
        <p className="mt-3 truncate text-[12.5px] text-subtle tabular">
          <span className="text-fg">{formatPrice(app.price)}</span> per run
        </p>
      </div>
    </Link>
  );
}
