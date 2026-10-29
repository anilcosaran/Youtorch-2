import type { OverviewProvider } from "@modelvend/admin-api/overview";
import type { HealthState } from "@modelvend/admin-api/providers";
import { AccessLink } from "@/components/shared/access-link";
import { HealthPill } from "@/components/shared/status";
import { compact, milliseconds, percent } from "@/lib/format";

type ProviderHealthRow = OverviewProvider;

/** Outages first, then degraded, then by traffic. */
const SEVERITY: Record<HealthState, number> = { outage: 0, degraded: 1, operational: 2 };

const bySeverity = (a: ProviderHealthRow, b: ProviderHealthRow) =>
  SEVERITY[a.state] - SEVERITY[b.state] || b.requests24h - a.requests24h;

const none = <span className="text-muted-foreground">—</span>;

/** One row per provider: its health and how it served the last 24 hours. */
export function ProviderHealthTable({ providers }: { providers: ProviderHealthRow[] }) {
  return (
    <div className="scroll-thin max-h-[296px] overflow-auto">
      <table className="w-full text-sm" aria-label="Provider health, last 24 hours">
        <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="h-8 text-left font-medium">
              Provider
            </th>
            <th scope="col" className="h-8 text-left font-medium">
              Health
            </th>
            <th scope="col" className="h-8 text-right font-medium">
              Success
            </th>
            <th scope="col" className="h-8 text-right font-medium">
              p50
            </th>
            <th scope="col" className="h-8 text-right font-medium whitespace-nowrap">
              Requests 24h
            </th>
          </tr>
        </thead>
        <tbody>
          {[...providers].sort(bySeverity).map((provider) => (
            <tr key={provider.id} className="border-t">
              <td className="h-10 max-w-40 truncate pr-3">
                <AccessLink
                  permission="providers.view"
                  href="/providers"
                  className="font-medium outline-none hover:underline focus-visible:underline"
                  plainClassName="font-medium"
                >
                  {provider.name}
                </AccessLink>
              </td>
              <td className="pr-3">
                <HealthPill state={provider.state} />
              </td>
              <td className="pl-3 text-right tabular">
                {provider.successRate === null ? none : percent(provider.successRate)}
              </td>
              <td className="pl-3 text-right whitespace-nowrap tabular">
                {provider.p50Ms === null ? none : milliseconds(provider.p50Ms)}
              </td>
              <td className="pl-3 text-right tabular">{compact(provider.requests24h)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
