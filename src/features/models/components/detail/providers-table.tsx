"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ShieldAlert, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Select } from "@/components/ui/select";
import { formatPrice } from "@/lib/format";
import type { Endpoint, Model, Region } from "@/types/model";
import { cn } from "@/lib/cn";
import { regionLabel, regionOptions, uptimeTone } from "../../lib/endpoints";
import { ModelArt } from "../model-art";

type Mode = "balanced" | "fastest" | "cheapest";
type Percentile = "p50" | "p90" | "p99";
type SortKey = "score" | "host" | "price" | "draft" | "latency" | "throughput" | "uptime";

const modeSort: Record<Mode, { key: SortKey; dir: 1 | -1 }> = {
  balanced: { key: "score", dir: 1 },
  fastest: { key: "latency", dir: 1 },
  cheapest: { key: "price", dir: 1 },
};

export function ProvidersTable({ model, endpoints }: { model: Model; endpoints: Endpoint[] }) {
  const [mode, setMode] = useState<Mode>("balanced");
  const [percentile, setPercentile] = useState<Percentile>("p50");
  const [region, setRegion] = useState<"all" | Region>("all");
  const [sort, setSort] = useState(modeSort.balanced);

  const rows = useMemo(() => {
    const minPrice = Math.min(...endpoints.map((e) => e.price));
    const minLatency = Math.min(...endpoints.map((e) => e.latency.p50));
    const value = (e: Endpoint): number | string => {
      switch (sort.key) {
        case "score":
          return e.price / minPrice + e.latency.p50 / minLatency + (100 - e.uptime) / 2;
        case "host":
          return `${e.host} ${e.location}`;
        case "price":
          return e.price;
        case "draft":
          return e.draftPrice ?? Infinity;
        case "latency":
          return e.latency[percentile];
        case "throughput":
          return e.throughput;
        case "uptime":
          return e.uptime;
      }
    };
    return endpoints
      .filter((e) => region === "all" || e.region === region || e.region === "global")
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
      });
  }, [endpoints, sort, percentile, region]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "throughput" || key === "uptime" ? -1 : 1 }));

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

  const unit = <span className="text-[11px] font-normal text-subtle">/{model.unit}</span>;

  return (
    <div className="rounded-[var(--radius-card)] border border-line p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Select
          label="Routing mode"
          size="lg"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setSort(modeSort[m]);
          }}
          className="w-44"
          options={[
            {
              value: "balanced",
              label: "Balanced",
              description: "Best mix of price, speed and uptime",
            },
            {
              value: "fastest",
              label: "Fastest",
              description: "Lowest latency first",
            },
            {
              value: "cheapest",
              label: "Cheapest",
              description: "Lowest price first",
            },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
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
          <Select label="Region" size="lg" value={region} onChange={setRegion} align="end" className="w-44" options={regionOptions} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[820px] text-[14px] whitespace-nowrap [&_td]:px-3 [&_td]:py-[11px] [&_td:first-child]:pl-4 [&_td:last-child]:pr-4">
          <thead className="text-left">
            <tr>
              {head("host", "Endpoint")}
              {head("price", <>Price {unit}</>, { align: "right" })}
              {head("draft", <>Draft {unit}</>, {
                align: "right",
                hint: "480p preview render for fast iteration",
              })}
              {head("latency", "Latency", {
                align: "right",
                hint: `${percentile.toUpperCase()} time to finished asset`,
              })}
              {head("throughput", "Throughput", { align: "right" })}
              {head("uptime", "Uptime", {
                align: "right",
                hint: "Successful requests, last 24 hours. Bars show the last 6 hours.",
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const discount = Math.round((1 - e.price / e.listPrice) * 100);
              return (
                <tr key={e.id} className="border-t border-line transition-colors hover:bg-white/[0.025]">
                  <td>
                    <div className="flex items-center gap-2.5">
                      {e.kind === "direct" && model.provider !== "youtorch" ? (
                        <ModelArt model={model} className="size-5 shrink-0 rounded-[4px]" />
                      ) : (
                        <LogoMark className="size-5 shrink-0" />
                      )}
                      <span className="text-fg capitalize">{e.host}</span>
                      <span className="text-muted">{e.location}</span>
                      <span className="font-mono text-[11px] text-subtle">{regionLabel[e.region]}</span>
                      {e.kind === "spot" ? (
                        <ShieldAlert aria-label="Preemptible, failed jobs are retried" className="size-3.5 text-warn" />
                      ) : (
                        <ShieldCheck aria-label="Zero data retention" className="size-3.5 text-ok" />
                      )}
                      {discount > 0 && <span className="text-[12px] font-medium text-deal">{discount}% off</span>}
                    </div>
                  </td>
                  <td className="text-right tabular">
                    {discount > 0 ? (
                      <>
                        <s className="mr-1.5 text-[12px] text-muted">{formatPrice(e.listPrice)}</s>
                        <span className="text-deal">{formatPrice(e.price)}</span>
                      </>
                    ) : (
                      <span className="text-fg">{formatPrice(e.price)}</span>
                    )}
                  </td>
                  <td className="text-right text-fg tabular">
                    {e.draftPrice === null ? <span className="text-white/40">--</span> : formatPrice(e.draftPrice)}
                  </td>
                  <td className="text-right text-fg tabular">{e.latency[percentile]}s</td>
                  <td className="text-right text-fg tabular">{e.throughput} rpm</td>
                  <td>
                    <div className="flex items-center justify-end gap-2.5">
                      <span className="flex gap-[2px]" aria-hidden>
                        {e.recent.map((v, i) => (
                          <span key={i} className={cn("h-4 w-[4px] rounded-[1px]", uptimeTone(v))} />
                        ))}
                      </span>
                      <span className="w-[60px] text-right text-fg tabular">{e.uptime.toFixed(2)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
