import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A stable hue for a name, so the same person keeps the same colour. */
function hueOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

/** A picture when there is one, otherwise initials on a generated gradient. */
export function Monogram({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote profile picture
      <img
        src={src}
        alt=""
        className={cn("inline-flex size-7 shrink-0 rounded-full bg-muted object-cover", className)}
      />
    );
  }
  const hue = hueOf(name);
  return (
    <span
      aria-hidden
      style={{
        background: `linear-gradient(135deg, oklch(0.62 0.13 ${hue}), oklch(0.45 0.15 ${hue + 35}))`,
      }}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-tight text-white select-none",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
