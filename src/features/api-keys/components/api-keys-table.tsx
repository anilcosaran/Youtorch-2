import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { ApiKey } from "@/types/workspace";

export function ApiKeysTable({ keys, onRevoke }: { keys: ApiKey[]; onRevoke: (key: ApiKey) => void }) {
  return (
    <div className="overflow-x-auto surface">
      <table className="w-full min-w-[640px] text-left text-[14px]">
        <thead>
          <tr className="border-b border-line font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
            <th className="px-4 py-2.5 font-normal">Name</th>
            <th className="px-4 py-2.5 font-normal">Key</th>
            <th className="px-4 py-2.5 font-normal">Mode</th>
            <th className="px-4 py-2.5 font-normal">Created</th>
            <th className="px-4 py-2.5 font-normal">Last used</th>
            <th className="px-4 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-b border-line last:border-0 hover:bg-white/[0.02]">
              <td className="px-4 py-3 font-medium">{k.name}</td>
              <td className="px-4 py-3 font-mono text-[13px] text-muted">{k.prefix}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[12px] font-medium",
                    k.env === "live" ? "bg-jade-500/12 text-jade-400" : "bg-iris-500/14 text-iris-300",
                  )}
                >
                  {k.env}
                </span>
              </td>
              <td className="px-4 py-3 text-muted">{k.created}</td>
              <td className="px-4 py-3 text-subtle">{k.lastUsed ?? "Never"}</td>
              <td className="px-4 py-3 text-right">
                <Button variant="ghost" size="icon" aria-label={`Revoke ${k.name}`} onClick={() => onRevoke(k)}>
                  <Trash2 />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
