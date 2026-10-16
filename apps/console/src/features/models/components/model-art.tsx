import type { CSSProperties } from "react";
import type { Model } from "@/types/model";
import { cn } from "@/lib/cn";

const grain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function ModelArt({ model, className }: { model: Model; className?: string }) {
  const [a, b, bg] = model.art.colors;
  const vars = { "--a": a, "--b": b, background: bg } as CSSProperties;

  return (
    <div className={cn("relative isolate overflow-hidden", className)} style={vars}>
      <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.08]">
        <Pattern pattern={model.art.pattern} a={a} b={b} slug={model.slug} />
      </div>
      <div className="absolute inset-0 opacity-[0.22] mix-blend-overlay" style={{ backgroundImage: grain }} />
      <div className="absolute inset-0 bg-gradient-to-t from-[rgb(0_0_0/0.55)] via-transparent to-[rgb(0_0_0/0.1)]" />
    </div>
  );
}

function Pattern({ pattern, a, b, slug }: { pattern: Model["art"]["pattern"]; a: string; b: string; slug: string }) {
  const gid = `g-${slug}`;
  switch (pattern) {
    case "orb":
      return (
        <>
          <div className="absolute inset-0" style={{ background: `radial-gradient(60% 70% at 75% 80%, ${b}55, transparent 70%)` }} />
          <div
            className="absolute top-1/2 left-1/2 aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(circle at 34% 28%, #ffffffcc 0, ${a} 22%, ${b} 62%, ${b}00 72%)`,
              boxShadow: `0 0 80px 10px ${a}55`,
            }}
          />
          <div
            className="absolute top-1/2 left-1/2 h-[14%] w-[78%] -translate-x-1/2 -translate-y-1/2 -rotate-12 rounded-[50%] border"
            style={{ borderColor: `${a}66` }}
          />
        </>
      );
    case "aurora":
      return (
        <>
          <div
            className="absolute -inset-1/4 animate-drift blur-2xl"
            style={{ background: `conic-gradient(from 210deg at 50% 60%, ${a}, ${b}, transparent 55%, ${a}aa 75%, ${b})` }}
          />
          <div className="absolute inset-0" style={{ background: `radial-gradient(80% 60% at 50% 110%, #000c, transparent)` }} />
        </>
      );
    case "dunes":
      return (
        <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={a} />
              <stop offset="1" stopColor={b} />
            </linearGradient>
          </defs>
          <circle cx="300" cy="70" r="34" fill={a} opacity="0.85" />
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M0 ${120 + i * 26} C 90 ${90 + i * 30}, 170 ${160 + i * 18}, 260 ${118 + i * 26} S 380 ${100 + i * 24}, 400 ${116 + i * 26} V225 H0Z`}
              fill={`url(#${gid})`}
              opacity={0.35 + i * 0.18}
            />
          ))}
        </svg>
      );
    case "horizon":
      return (
        <>
          <div
            className="absolute top-[14%] left-1/2 aspect-square w-[38%] -translate-x-1/2 rounded-full"
            style={{
              background: `linear-gradient(180deg, ${b}, ${a})`,
              maskImage: "repeating-linear-gradient(180deg, #000 0 9px, transparent 9px 12px)",
              boxShadow: `0 0 60px ${a}66`,
            }}
          />
          <div className="absolute inset-x-0 bottom-0 h-[44%] overflow-hidden [perspective:220px]">
            <div
              className="absolute inset-x-[-50%] top-0 h-[200%] origin-top [transform:rotateX(62deg)]"
              style={{
                backgroundImage: `linear-gradient(${a}88 1px, transparent 1px), linear-gradient(90deg, ${a}88 1px, transparent 1px)`,
                backgroundSize: "28px 28px",
                maskImage: "linear-gradient(to bottom, transparent, #000 30%)",
              }}
            />
          </div>
          <div className="absolute inset-x-0 top-[56%] h-px" style={{ background: a, boxShadow: `0 0 18px 2px ${a}` }} />
        </>
      );
    case "rings":
      return (
        <>
          <div
            className="absolute inset-0"
            style={{ background: `repeating-radial-gradient(circle at 30% 120%, ${a}00 0 14px, ${a}55 15px, ${a}00 17px)` }}
          />
          <div className="absolute inset-0" style={{ background: `radial-gradient(70% 90% at 30% 120%, ${b}88, transparent 70%)` }} />
          <div
            className="absolute right-[14%] bottom-[22%] aspect-square w-[14%] rounded-full"
            style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${b} 45%, ${a})`, boxShadow: `0 0 40px ${b}` }}
          />
        </>
      );
    case "prism":
      return (
        <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={a} />
              <stop offset="1" stopColor={b} />
            </linearGradient>
          </defs>
          <path d="M-20 225 L140 40 L300 225Z" fill={`url(#${gid})`} opacity="0.9" />
          <path d="M120 225 L260 70 L420 225Z" fill={b} opacity="0.55" />
          <path d="M140 40 L170 225 L120 225Z" fill="#fff" opacity="0.12" />
          <path d="M0 150 L400 105" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
        </svg>
      );
  }
}
