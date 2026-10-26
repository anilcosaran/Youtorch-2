"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import type { ModelProvider } from "@/types/model";
import { uptimeTone } from "../../lib/endpoints";

type Percentile = "p50" | "p90" | "p99";
type SortKey = "name" | "region" | "latency" | "uptime";

/** Who serves an open model, where, and how well. Only shown for open models; prices are the model's own. */
export function ProvidersTable({ providers }: { providers: ModelProvider[] }) {
  const [percentile, setPercentile] = useState<Percentile>("p50");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "latency", dir: 1 });

  const rows = useMemo(() => {
    const value = (p: ModelProvider): number | string => {
      switch (sort.key) {
        case "name":
          return p.name;
        case "region":
          return p.region;
        case "latency":
          return p.latency[percentile];
        case "uptime":
          return p.uptime;
      }
    };
    return [...providers].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
    });
  }, [providers, sort, percentile]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "uptime" ? -1 : 1 }));

  const head = (key: SortKey, children: ReactNode, opts: { align?: "right"; hint?: string } = {}) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
    return (
      <th
        aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        className={cn("px-3 py-2.5 font-medium first:pl-4 last:pr-4", opts.align === "right" && "text-right")}
      >
        <button
          onClick={() => toggle(key)}
          title={opts.hint}
          className={cn(
            "inline-flex items-center gap-1.5 text-[13px] transition hover:text-fg",
            active ? "text-fg" : "text-muted",
            opts.align === "right" && "flex-row-reverse",
          )}
        >
          <span className={cn(opts.hint && "underline decoration-white/35 decoration-dotted underline-offset-[5px]")}>{children}</span>
          <Icon className={cn("size-3.5", !active && "text-subtle")} />
        </button>
      </th>
    );
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-line p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <span className="mr-1 text-[14px] text-muted">Latency</span>
        <Select
          label="Latency percentile"
          size="lg"
          className="w-24"
          value={percentile}
          onChange={setPercentile}
          options={[
            { value: "p50", label: "P50" },
            { value: "p90", label: "P90" },
            { value: "p99", label: "P99" },
          ]}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[560px] text-[14px] whitespace-nowrap [&_td]:px-3 [&_td]:py-[11px] [&_td:first-child]:pl-4 [&_td:last-child]:pr-4">
          <thead className="text-left">
            <tr>
              {head("name", "Provider")}
              {head("region", "Region")}
              {head("latency", "Latency", { align: "right", hint: `${percentile.toUpperCase()} time to finished asset` })}
              {head("uptime", "Uptime", {
                align: "right",
                hint: "Successful requests, last 24 hours. Bars show the last 6 hours.",
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-line transition-colors hover:bg-white/[0.025]">
                <td className="text-fg">{p.name}</td>
                <td className="font-mono text-[12.5px] text-muted">{p.region}</td>
                <td className="text-right text-fg tabular">{p.latency[percentile]}s</td>
                <td>
                  <div className="flex items-center justify-end gap-2.5">
                    <span className="flex gap-[2px]" aria-hidden>
                      {p.recent.map((v, i) => (
                        <span key={i} className={cn("h-4 w-[4px] rounded-[1px]", uptimeTone(v))} />
                      ))}
                    </span>
                    <span className="w-[60px] text-right text-fg tabular">{p.uptime.toFixed(2)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
