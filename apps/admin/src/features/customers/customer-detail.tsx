"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Activity, Ban, Ellipsis, History, Play, SlidersHorizontal, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState } from "@/components/data/states";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { useConfirm } from "@/components/shared/confirm";
import { Pill } from "@/components/shared/pill";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, errorMessage } from "@/lib/api/client";
import { getCustomer, resumeCustomer, suspendCustomer, type Customer } from "@/lib/api/customers";
import { keys } from "@/lib/api/keys";
import { integer, percent, usd } from "@/lib/format";
import { TIER_LABELS } from "@/lib/labels";
import { toastError } from "@/lib/notify";
import { usePermissions } from "@/lib/session";
import { Balance, LOW_BALANCE } from "./balance";
import { storeCustomer } from "./cache";
import { CreditsDialog } from "./credits-dialog";
import { CustomerKeys } from "./customer-keys";
import { LedgerCard } from "./ledger-card";
import { LimitsCard } from "./limits-card";
import { LimitsDialog } from "./limits-dialog";
import { TopModelsCard, UsageCard } from "./usage-cards";

/** Why the workspace is suspended, and the way back for operators who may resume it. */
function SuspendedBanner({ reason, onResume }: { reason: string | null; onResume?: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-[color-mix(in_oklch,var(--status-critical)_45%,transparent)] bg-[color-mix(in_oklch,var(--status-critical)_8%,transparent)] px-4 py-3 text-sm"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          Suspended. Every key of this workspace gets 403 <code className="font-mono text-xs">account_suspended</code>.
        </p>
        <p className="text-muted-foreground">{reason || "No reason was given."}</p>
      </div>
      {onResume && (
        <Button variant="outline" size="sm" onClick={onResume} className="shrink-0">
          <Play /> Resume
        </Button>
      )}
    </div>
  );
}

function Tiles({ data }: { data: Customer }) {
  const totals = data.usage.reduce(
    (sum, d) => ({ requests: sum.requests + d.requests, errors: sum.errors + d.errors }),
    { requests: 0, errors: 0 },
  );
  const { autoReload, limits } = data;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile
        label="Balance"
        value={<Balance value={data.balance} />}
        tone={data.balance < LOW_BALANCE ? "attention" : undefined}
        hint={
          autoReload.enabled
            ? `Auto-reload ${usd(autoReload.amount)} below ${usd(autoReload.threshold)}`
            : "Auto-reload off"
        }
        info="Prepaid credit. Every request draws it down; operators can grant or take back credit."
      />
      <StatTile
        label="Spend 30d"
        value={usd(data.spend30d)}
        hint={limits.monthlySpendCap === null ? "No monthly cap" : `Capped at ${usd(limits.monthlySpendCap)} a month`}
      />
      <StatTile
        label="Requests 30d"
        value={integer(data.requests30d)}
        hint={
          totals.requests === 0
            ? "No requests"
            : totals.errors === 0
              ? "None failed"
              : `${integer(totals.errors)} failed · ${percent(totals.errors / totals.requests)}`
        }
      />
      <StatTile
        label="Active keys"
        value={integer(data.keys)}
        hint={
          <span className="flex items-center gap-1.5">
            <Pill tone="info" className="h-5 px-2">
              {TIER_LABELS[data.tier]}
            </Pill>
            {integer(limits.requestsPerMinute)} requests a minute
          </span>
        }
      />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

/** The `…` menu: suspend or resume, and the customer's requests and audit trail elsewhere in the console. */
function MoreMenu({
  data,
  busy,
  onSuspend,
  onResume,
}: {
  data: Customer;
  busy: boolean;
  onSuspend: () => void;
  onResume: () => void;
}) {
  const can = usePermissions();
  const links = can.viewRequests || can.viewAudit;
  if (!can.editCustomers && !links) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="More actions" disabled={busy}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {can.viewRequests && (
          <DropdownMenuItem asChild>
            <Link href={`/requests?customerId=${encodeURIComponent(data.id)}`}>
              <Activity /> View requests
            </Link>
          </DropdownMenuItem>
        )}
        {can.viewAudit && (
          <DropdownMenuItem asChild>
            <Link href={`/audit?targetType=customer&targetId=${encodeURIComponent(data.id)}`}>
              <History /> Audit trail
            </Link>
          </DropdownMenuItem>
        )}
        {links && can.editCustomers && <DropdownMenuSeparator />}
        {can.editCustomers &&
          (data.status === "suspended" ? (
            <DropdownMenuItem onSelect={onResume}>
              <Play /> Resume
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={onSuspend}>
              <Ban /> Suspend
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CustomerDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const can = usePermissions();
  const customer = useQuery({ queryKey: keys.customer(id), queryFn: () => getCustomer(id) });
  const [crediting, setCrediting] = useState(false);
  const [limiting, setLimiting] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = customer.data;

  const suspend = async (reason: string) => {
    const updated = await suspendCustomer(id, reason);
    storeCustomer(queryClient, updated);
    setSuspending(false);
    toast.success(`${updated.name} is suspended`, { description: "Their keys get 403 until you resume them." });
  };

  const resume = async () => {
    if (!data) return;
    const ok = await confirm({
      title: `Resume ${data.name}?`,
      description: `Every active key of ${data.workspace} works again at once.`,
      action: "Resume",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await resumeCustomer(id);
      storeCustomer(queryClient, updated);
      toast.success(`${updated.name} is active again`);
    } catch (error) {
      toastError(error, "Couldn't resume the customer");
    } finally {
      setBusy(false);
    }
  };

  const notFound = customer.error instanceof ApiError && customer.error.status === 404;

  return (
    <>
      <PageHeader
        title={data?.name ?? "Customer"}
        parent={{ href: "/customers", label: "Customers" }}
        description={data && `${data.email} · ${data.workspace}`}
      >
        {data && can.grantCredits && (
          <Button variant="outline" size="sm" onClick={() => setCrediting(true)} aria-label="Add credits">
            <Wallet /> <span className="hidden md:inline">Add credits</span>
          </Button>
        )}
        {data && can.editCustomers && (
          <Button variant="outline" size="sm" onClick={() => setLimiting(true)} aria-label="Limits">
            <SlidersHorizontal /> <span className="hidden md:inline">Limits</span>
          </Button>
        )}
        {data && (
          <MoreMenu
            data={data}
            busy={busy}
            onSuspend={() => setSuspending(true)}
            onResume={() => void resume()}
          />
        )}
      </PageHeader>
      <PageBody className="flex flex-col gap-4">
        {notFound ? (
          <EmptyState
            className="rounded-lg border bg-card"
            title="This customer doesn't exist"
            description="The link may be old, or the workspace was deleted."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/customers">Back to customers</Link>
              </Button>
            }
          />
        ) : customer.error && !data ? (
          <ErrorState
            error={customer.error}
            onRetry={() => void customer.refetch()}
            retrying={customer.isFetching}
            className="rounded-lg border bg-card"
          />
        ) : !data ? (
          <DetailSkeleton />
        ) : (
          <>
            {data.status === "suspended" && (
              <SuspendedBanner
                reason={data.suspendedReason}
                onResume={can.editCustomers ? () => void resume() : undefined}
              />
            )}
            <Tiles data={data} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <UsageCard usage={data.usage} />
              <TopModelsCard models={data.topModels} />
            </div>
            {/* Without access to keys, the ledger takes their place next to the limits. */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              {can.viewKeys ? <CustomerKeys customerId={data.id} /> : <LedgerCard ledger={data.ledger} />}
              <LimitsCard customer={data} onEdit={can.editCustomers ? () => setLimiting(true) : undefined} />
            </div>
            {can.viewKeys && <LedgerCard ledger={data.ledger} />}
            <CreditsDialog customer={data} open={crediting} onOpenChange={setCrediting} />
            <LimitsDialog customer={data} open={limiting} onOpenChange={setLimiting} />
          </>
        )}
      </PageBody>
      <ReasonDialog
        open={suspending}
        onOpenChange={setSuspending}
        title={`Suspend ${data?.name ?? "customer"}`}
        description={
          <>
            Every key of {data?.workspace ?? "this workspace"} gets 403{" "}
            <code className="font-mono text-xs">account_suspended</code> at once, until you resume it. The balance and
            keys are kept.
          </>
        }
        label="Reason"
        placeholder="Why the workspace is suspended, shown on this page and in the audit log"
        required
        destructive
        action="Suspend"
        onSubmit={suspend}
        describeError={errorMessage}
      />
    </>
  );
}
