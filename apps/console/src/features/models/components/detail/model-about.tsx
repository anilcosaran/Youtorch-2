"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { discounted } from "@/lib/pricing";
import type { Model } from "@/types/model";

/**
 * Two-line summary that expands only when the text actually overflows. The toggle keeps its row even when
 * hidden, and starts out shown because the copy nearly always overflows, so measuring never shifts the page.
 */
export function ModelAbout({ model, endpoints }: { model: Model; endpoints: number }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(true);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mt-5">
      <p ref={ref} className={cn("text-[15px] leading-[1.65] text-fg/75", !expanded && "line-clamp-2")}>
        {model.description} Supports {model.capabilities.join(", ").replace(/→/g, "to")}, with output up to {model.maxOutput}. {model.name}{" "}
        is served from {endpoints} endpoints with automatic failover, and every request is billed per {model.unit}
        {model.unitDetail ? ` at ${model.unitDetail}` : ""}
        {model.inputPrice
          ? `, plus ${formatPrice(discounted(model, model.inputPrice.price))} per ${model.inputPrice.unit} of reference input`
          : ""}
        . Higher tiers are listed in the Pricing tab, and test keys run the same model for free so you can tune prompts before going live.
      </p>
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-hidden={!overflows && !expanded}
        tabIndex={overflows || expanded ? undefined : -1}
        className={cn(
          "mt-1 inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-fg",
          !overflows && !expanded && "invisible",
        )}
      >
        {expanded ? "Show less" : "Show more"} <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
      </button>
    </div>
  );
}
