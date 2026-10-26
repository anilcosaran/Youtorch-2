import { Fragment } from "react";
import { Webhook } from "lucide-react";
import { formatPrice } from "@/lib/format";
import type { Flow } from "@/mocks/canvas";
import { flowCost } from "../lib/flow";
import { FlowNode } from "./flow-node";

/** Nodes share the row and stop shrinking at a readable width; past that the board scrolls sideways. */
const node = "w-auto min-w-[176px] max-w-[220px] flex-1";

/** A flow laid out left to right, ending in the endpoint that runs it. */
export function FlowBoard({ flow }: { flow: Flow }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/40">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <span className="text-[14px] font-medium text-fg">{flow.name}</span>
        <span className="text-[13px] text-muted">
          {flow.steps.length} steps · {formatPrice(flowCost(flow))} per run
        </span>
        <span className="flex-1" />
        <span className="text-[12.5px] text-subtle">Sample flow</span>
      </div>
      <div className="overflow-x-auto dot-grid">
        <div className="flex items-center [justify-content:safe_center] px-6 py-10">
          {flow.steps.map((step) => (
            <Fragment key={step.id}>
              <FlowNode step={step} className={node} />
              <Wire />
            </Fragment>
          ))}
          <div className={`${node} rounded-xl border border-iris-500/40 bg-raised/90 p-3 shadow-2xl shadow-black/30`}>
            <div className="flex items-center gap-1.5 text-[12px]">
              <Webhook className="size-3.5 text-iris-300" />
              <span className="font-medium text-fg">Endpoint</span>
              <span className="flex-1" />
              <span className="text-subtle">Preview</span>
            </div>
            <p className="mt-2.5 rounded-lg bg-white/[0.05] px-2.5 py-2 font-mono text-[12px] leading-relaxed text-fg/85">
              <span className="text-iris-300">POST</span>{" "}
              {flow.endpoint.split(/(?<=\/)/).map((part, i) => (
                <Fragment key={i}>
                  {part}
                  <wbr />
                </Fragment>
              ))}
            </p>
            <p className="mt-2 text-[12px] leading-snug text-muted">
              One call runs every step and returns video and audio with signed URLs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Wire() {
  return (
    <svg aria-hidden viewBox="0 0 40 12" className="h-3 w-10 shrink-0">
      <path d="M2 6H38" stroke="var(--color-iris-400)" strokeOpacity={0.3} />
      <path d="M2 6H38" stroke="var(--color-iris-300)" strokeWidth={1.5} strokeDasharray="4 6" className="motion-safe:animate-flow" />
      <circle cx={3} cy={6} r={3} fill="var(--color-iris-300)" />
      <circle cx={37} cy={6} r={3} fill="var(--color-iris-300)" />
    </svg>
  );
}
