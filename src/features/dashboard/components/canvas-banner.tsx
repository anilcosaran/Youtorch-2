import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FlowNode, stepKinds } from "@/features/canvas/components/flow-node";
import { teaserFlow } from "@/mocks/canvas";

/**
 * Where each step floats, as the point its inner edge touches (percent of the banner).
 * Wires run from these ports into the title, so they line up at any banner size.
 */
const ports = [
  { side: "left", x: 25, y: 31 },
  { side: "left", x: 21, y: 72 },
  { side: "right", x: 75, y: 31 },
  { side: "right", x: 79, y: 72 },
] as const;

const wire = (x: number, y: number) => `M ${x} ${y} C ${x + (50 - x) * 0.6} ${y}, ${x < 50 ? 38 : 62} 50, 50 50`;

const floor = [
  "linear-gradient(rgb(143 127 247 / 0.28) 1px, transparent 1px)",
  "linear-gradient(90deg, rgb(143 127 247 / 0.28) 1px, transparent 1px)",
].join(", ");

export function CanvasBanner() {
  return (
    <section
      className="always-dark @container relative isolate overflow-hidden rounded-[20px] border border-[rgb(143_127_247/0.32)] bg-[#05060b]"
      style={{ boxShadow: "0 32px 90px -48px rgb(122 102 238 / 0.8), inset 0 0 0 1px rgb(143 127 247 / 0.08)" }}
    >
      <div
        aria-hidden
        className="absolute inset-x-[-30%] bottom-0 -z-10 h-[64%] origin-bottom [transform:perspective(520px)_rotateX(64deg)] [mask-image:linear-gradient(to_top,#000_5%,transparent_85%)]"
        style={{ backgroundImage: floor, backgroundSize: "56px 56px", backgroundPosition: "center bottom" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: "radial-gradient(55% 60% at 50% 105%, rgb(122 102 238 / 0.5), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-x-[12%] bottom-0 h-px bg-gradient-to-r from-transparent via-[rgb(185_178_255/0.9)] to-transparent"
      />

      <div aria-hidden className="pointer-events-none absolute inset-0 hidden @5xl:block">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full [mask-image:radial-gradient(26%_34%_at_50%_50%,transparent_55%,#000_100%)]"
        >
          {ports.map(({ x, y }) => (
            <g key={`${x}-${y}`} fill="none">
              <path d={wire(x, y)} stroke="rgb(143 127 247 / 0.3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path
                d={wire(x, y)}
                stroke="rgb(185 178 255 / 0.85)"
                strokeWidth={1.5}
                strokeDasharray="4 6"
                vectorEffect="non-scaling-stroke"
                className="motion-safe:animate-flow"
              />
            </g>
          ))}
        </svg>
        {teaserFlow.steps.map((step, i) => {
          const { side, x, y } = ports[i];
          return (
            <div
              key={step.id}
              className="absolute -translate-y-1/2"
              style={{ top: `${y}%`, ...(side === "left" ? { right: `${100 - x}%` } : { left: `${x}%` }) }}
            >
              <FlowNode step={step} />
              <span
                className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-iris-300 ring-4 ring-[rgb(122_102_238/0.25)]"
                style={side === "left" ? { right: -4 } : { left: -4 }}
              />
            </div>
          );
        })}
      </div>

      <div className="relative mx-auto flex min-h-[400px] max-w-md flex-col items-center justify-center px-6 py-14 text-center @5xl:min-h-[460px]">
        <div className="flex items-center gap-1.5">
          {teaserFlow.steps.map((step, i) => {
            const Icon = stepKinds[step.kind].icon;
            return (
              <span
                key={step.id}
                className="grid size-8 place-items-center rounded-lg border border-[rgb(185_178_255/0.25)] bg-[rgb(122_102_238/0.16)] text-iris-300"
                style={{ transform: `rotate(${(i - 1.5) * 6}deg)` }}
              >
                <Icon className="size-4" />
              </span>
            );
          })}
        </div>
        <h2 className="mt-5 bg-gradient-to-b from-white from-35% to-iris-300 bg-clip-text text-[clamp(48px,7.5cqw,88px)] leading-[0.9] font-black tracking-[-0.045em] text-transparent uppercase">
          Canvas
        </h2>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted">
          Chain any models on one board, then ship the whole flow as a single endpoint.
        </p>
        <Link
          href="/canvas"
          className="group mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-[#fff] px-4 text-[14px] font-semibold text-[#0b0c0f] transition hover:bg-[rgb(255_255_255/0.9)]"
        >
          Open Canvas <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-line bg-white/[0.04] px-2.5 py-1 font-mono text-[12px] text-muted">
          <span className="size-1.5 rounded-full bg-ok" />
          POST {teaserFlow.endpoint}
        </p>
      </div>
    </section>
  );
}
