"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ban, CircleCheck, KeyRound, MoreHorizontal, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Operator } from "@modelvend/admin-api/auth";
import { fieldErrors } from "@modelvend/admin-api/client";
import { listOperators, resetOperatorPassword, updateOperator } from "@modelvend/admin-api/operators";
import { DataTable, type Column } from "@/components/data/data-table";
import { ListPanel } from "@/components/data/list-panel";
import { EmptyState } from "@/components/data/states";
import { PageFill, PageHeader } from "@/components/layout/page-header";
import { useConfirm } from "@/components/shared/confirm";
import { Monogram } from "@/components/shared/monogram";
import { Pill } from "@/components/shared/pill";
import { RelativeTime } from "@/components/shared/time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/lib/notify";
import { accessLabel } from "@/lib/permissions";
import { keys } from "@/lib/query-keys";
import { useSession } from "@/lib/session";
import { PasswordDialog } from "./operator-dialogs";
import { CreateOperatorSheet, EditAccessSheet, usePermissionCatalog } from "./operator-sheets";

function RowActions({
  operator,
  self,
  onEdit,
  onReset,
}: {
  operator: Operator;
  self: boolean;
  onEdit: (operator: Operator) => void;
  onReset: (operator: Operator) => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const toggleDisabled = async () => {
    if (!operator.disabled) {
      const ok = await confirm({
        title: `Disable ${operator.name}?`,
        description: "Their sessions end and they can't sign in until you enable them again.",
        action: "Disable",
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      const updated = await updateOperator(operator.id, { disabled: !operator.disabled });
      queryClient.setQueryData<Operator[]>(keys.operators, (list) =>
        list?.map((o) => (o.id === updated.id ? updated : o)),
      );
      toast.success(updated.disabled ? `${updated.name} is disabled` : `${updated.name} can sign in again`);
    } catch (error) {
      // A refused change names the field it refused.
      const reason = Object.values(fieldErrors(error))[0];
      if (reason) toast.error("Couldn't update the operator", { description: reason });
      else toastError(error, "Couldn't update the operator");
    }
  };

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${operator.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => onEdit(operator)}>
            <ShieldCheck /> {self ? "View access" : "Edit access"}
          </DropdownMenuItem>
          {!self && (
            <>
              <DropdownMenuItem onSelect={() => onReset(operator)}>
                <KeyRound /> Reset password
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={operator.disabled ? "default" : "destructive"}
                onSelect={() => void toggleDisabled()}
              >
                {operator.disabled ? <CircleCheck /> : <Ban />}
                {operator.disabled ? "Enable" : "Disable"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

export function OperatorsView() {
  const { operator: me, can } = useSession();
  const confirm = useConfirm();
  const operators = useQuery({
    queryKey: keys.operators,
    queryFn: listOperators,
    enabled: can.manageOperators,
  });
  const catalog = usePermissionCatalog();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [shownPassword, setShownPassword] = useState<{ title: string; password: string } | null>(null);

  const resetPassword = async (operator: Operator) => {
    const ok = await confirm({
      title: `Reset ${operator.name}'s password?`,
      description: "Their current password stops working and their sessions end. You get a new one to share with them.",
      action: "Reset password",
      destructive: true,
    });
    if (!ok) return;
    try {
      const { password } = await resetOperatorPassword(operator.id);
      if (password) setShownPassword({ title: `New password for ${operator.name}`, password });
    } catch (error) {
      toastError(error, "Couldn't reset the password");
    }
  };

  const created = (operator: Operator, password: string | null) => {
    setCreating(false);
    if (password) setShownPassword({ title: `${operator.name} can sign in now`, password });
    else toast.success(`${operator.name} can sign in now`, { description: "Share the password you set with them privately." });
  };

  const presets = catalog.data?.presets ?? [];
  const columns: Column<Operator>[] = [
    {
      id: "name",
      header: "Operator",
      className: "min-w-56",
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Monogram name={row.name} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="truncate">{row.name}</span>
              {row.id === me?.id && <Pill tone="info">You</Pill>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: "access",
      header: "Access",
      cell: (row) => <span className="whitespace-nowrap">{accessLabel(row, presets)}</span>,
    },
    { id: "login", header: "Last sign-in", cell: (row) => <RelativeTime value={row.lastLoginAt} /> },
    {
      id: "status",
      header: "Status",
      cell: (row) => (row.disabled ? <Pill tone="critical">Disabled</Pill> : <Pill tone="good">Active</Pill>),
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (row) => (
        <RowActions
          operator={row}
          self={row.id === me?.id}
          onEdit={setEditing}
          onReset={(o) => void resetPassword(o)}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Operators" description="People who can sign in to this console, and what each may do">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Add operator
        </Button>
      </PageHeader>
      <PageFill>
        <ListPanel>
          <DataTable
            label="Operators"
            columns={columns}
            rows={operators.data}
            rowKey={(row) => row.id}
            onRowClick={setEditing}
            isActiveRow={(row) => row.id === editing?.id}
            error={operators.error}
            onRetry={() => void operators.refetch()}
            retrying={operators.isFetching}
            skeletonRows={4}
            empty={<EmptyState title="No operators" />}
          />
        </ListPanel>
      </PageFill>
      <CreateOperatorSheet open={creating} onClose={() => setCreating(false)} onCreated={created} />
      <EditAccessSheet operator={editing} self={editing?.id === me?.id} onClose={() => setEditing(null)} />
      <PasswordDialog
        open={shownPassword !== null}
        onOpenChange={(open) => !open && setShownPassword(null)}
        title={shownPassword?.title ?? "New password"}
        password={shownPassword?.password ?? ""}
      />
    </>
  );
}
