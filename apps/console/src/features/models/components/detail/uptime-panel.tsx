import { cn } from "@/lib/cn";
import type { ModelStats, Status } from "@/types/model";
import { statusTone } from "../../lib/endpoints";
import { DetailPanel } from "./detail-section";

export function UptimePanel({ stats }: { stats: ModelStats }) {
  return (
    <DetailPanel>
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-3.5 pb-3">
        <div>
          <p className="text-[13px] text-muted">Routed availability</p>
          <p className="mt-0.5 text-[24px] leading-tight font-semibold tracking-tight text-fg tabular">{stats.uptimePct.toFixed(2)}%</p>
        </div>
        <div className="flex gap-4 text-[12px] text-muted">
          <Legend className="bg-ok" label="Operational" />
          <Legend className="bg-warn" label="Degraded" />
          <Legend className="bg-down" label="Outage" />
        </div>
      </div>
      <div className="px-4 pb-4">
        <StatusStrip days={stats.uptime} className="h-8" />
        <div className="mt-1.5 flex justify-between text-[12px] text-subtle">
          <span>{stats.uptime.length} days ago</span>
          <span>Today</span>
        </div>
      </div>
      <ul>
        {stats.endpoints.map((e) => (
          <li key={e.id} className="grid grid-cols-[200px_1fr_60px] items-center gap-4 border-t border-line px-4 py-2.5 text-[14px]">
            <span className="truncate">
              <span className="font-medium text-fg capitalize">{e.host}</span> <span className="text-muted">{e.location}</span>
            </span>
            <StatusStrip days={e.history} className="h-4" />
            <span className="text-right text-fg tabular">{e.uptime.toFixed(2)}%</span>
          </li>
        ))}
      </ul>
    </DetailPanel>
  );
}

function StatusStrip({ days, className }: { days: Status[]; className?: string }) {
  return (
    <div className={cn("flex gap-[2px]", className)}>
      {days.map((s, i) => {
        const ago = days.length - 1 - i;
        return (
          <span
            key={i}
            title={`${ago === 0 ? "Today" : `${ago}d ago`}: ${s === "ok" ? "operational" : s}`}
            className={cn("flex-1 rounded-[1.5px] transition-opacity hover:opacity-60", statusTone[s])}
          />
        );
      })}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-[2px]", className)} /> {label}
    </span>
  );
}
