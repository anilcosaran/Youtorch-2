import { cn } from "@/lib/cn";
import { recentRequests } from "@/mocks/usage";
import type { RequestLog } from "@/types/usage";

export function RequestTable({ rows = recentRequests }: { rows?: RequestLog[] }) {
  return (
    <div className="overflow-x-auto surface">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead>
          <tr className="border-b border-line font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
            <th className="px-4 py-2.5 font-normal">Request</th>
            <th className="px-4 py-2.5 font-normal">Model</th>
            <th className="px-4 py-2.5 font-normal">Status</th>
            <th className="px-4 py-2.5 text-right font-normal">Duration</th>
            <th className="px-4 py-2.5 text-right font-normal">Cost</th>
            <th className="px-4 py-2.5 text-right font-normal">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ok = r.status < 400;
            return (
              <tr key={r.id} className="border-b border-line transition last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-2.5">
                  <span className="block font-mono text-[13px]">{r.id}</span>
                  <span className="block text-[12px] text-subtle">{r.endpoint}</span>
                </td>
                <td className="px-4 py-2.5 text-muted">{r.model}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[12px]",
                      ok ? "bg-jade-500/10 text-jade-400" : "bg-rose-400/10 text-rose-400",
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", ok ? "bg-jade-400" : "bg-rose-400")} />
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right text-muted tabular">{r.duration}s</td>
                <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular">${r.cost.toFixed(3)}</td>
                <td className="px-4 py-2.5 text-right text-subtle">{r.ago}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
