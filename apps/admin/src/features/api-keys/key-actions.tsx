"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Ban, Gauge, LoaderCircle, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { revokeApiKey, updateApiKey, type ApiKeyRow } from "@modelvend/admin-api/api-keys";
import { errorMessage, type Page } from "@modelvend/admin-api/client";
import { Field, FormError } from "@/components/shared/field";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dollarsError, parseDollars } from "@/features/customers/money";
import { MoneyInput } from "@/features/customers/money-input";
import { usd } from "@/lib/format";
import { formErrors } from "@/lib/notify";
import { keys } from "@/lib/query-keys";

/**
 * After a change to a key: every list on screen shows it at once, then the
 * lists, its customer and the audit log load again.
 */
function storeKey(queryClient: QueryClient, key: ApiKeyRow) {
  queryClient.setQueriesData<Page<ApiKeyRow>>({ queryKey: keys.apiKeys }, (page) =>
    page ? { ...page, items: page.items.map((item) => (item.id === key.id ? key : item)) } : page,
  );
  void queryClient.invalidateQueries({ queryKey: keys.apiKeys });
  void queryClient.invalidateQueries({ queryKey: keys.customers });
  void queryClient.invalidateQueries({ queryKey: keys.audit });
}

type KeyAction = { kind: "revoke" | "limit"; key: ApiKeyRow };

/**
 * Which key action is open. The last one stays set while its dialog
 * animates out, so the title doesn't change under the operator's eyes.
 */
export function useKeyActions() {
  const [action, setAction] = useState<KeyAction | null>(null);
  const [open, setOpen] = useState(false);
  return {
    action,
    open,
    setOpen,
    start: (kind: KeyAction["kind"], key: ApiKeyRow) => {
      setAction({ kind, key });
      setOpen(true);
    },
  };
}

/** The `…` menu of a key row: set its spend limit or revoke it. Revoked keys have none. */
export function KeyActionsMenu({
  row,
  onStart,
}: {
  row: ApiKeyRow;
  onStart: (kind: KeyAction["kind"], key: ApiKeyRow) => void;
}) {
  if (row.status === "revoked") return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onStart("limit", row)}>
          <Gauge /> Set spend limit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onStart("revoke", row)}>
          <Ban /> Revoke
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SpendLimitForm({ apiKey, onDone }: { apiKey: ApiKeyRow; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(apiKey.spendLimit === null ? "" : String(apiKey.spendLimit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const limit = parseDollars(text);
  const invalid = limit !== null && !(limit > 0);
  const changed = !invalid && limit !== apiKey.spendLimit;
  const problem =
    fields.spendLimit ?? dollarsError(text) ?? (invalid ? "Enter an amount above $0 with at most two decimals." : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed || busy) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const updated = await updateApiKey(apiKey.id, { spendLimit: limit });
      storeKey(queryClient, updated);
      toast.success(
        updated.spendLimit === null
          ? `${updated.name} has no spend limit`
          : `${updated.name} stops at ${usd(updated.spendLimit)} a month`,
      );
      onDone();
    } catch (err) {
      const shown = formErrors(err, ["spendLimit"]);
      setFields(shown.fields);
      setError(shown.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field
        id="spend-limit"
        label="Monthly spend limit"
        hint={`Leave empty for no limit. It spent ${usd(apiKey.spend30d)} in the last 30 days.`}
        error={problem}
      >
        <MoneyInput
          id="spend-limit"
          autoFocus
          value={text}
          onChange={setText}
          placeholder="No limit"
          invalid={Boolean(problem)}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !changed}>
          {busy && <LoaderCircle className="animate-spin" />}
          Save limit
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The dialogs behind the key menu; render once next to the table. */
export function KeyActionDialogs({
  action,
  open,
  setOpen,
}: Pick<ReturnType<typeof useKeyActions>, "action" | "open" | "setOpen">) {
  const queryClient = useQueryClient();
  const key = action?.key;

  const revoke = async (reason: string) => {
    if (!key) return;
    const updated = await revokeApiKey(key.id, reason);
    storeKey(queryClient, updated);
    setOpen(false);
    toast.success(`${updated.name} is revoked`, { description: "Requests with it now get 401." });
  };

  return (
    <>
      <Dialog open={open && action?.kind === "limit"} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set spend limit</DialogTitle>
            <DialogDescription>
              Requests with {key?.name ?? "this key"} stop once its spend this month reaches the limit.
              Other keys of {key?.customer.workspace ?? "the workspace"} keep working.
            </DialogDescription>
          </DialogHeader>
          {open && action?.kind === "limit" && <SpendLimitForm apiKey={action.key} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={open && action?.kind === "revoke"}
        onOpenChange={setOpen}
        title={`Revoke ${key?.name ?? "key"}`}
        description="Requests with this key fail at once with 401. This can't be undone."
        label="Reason"
        placeholder="Why the key is revoked, for the audit log"
        required
        destructive
        action="Revoke key"
        onSubmit={revoke}
        describeError={errorMessage}
      />
    </>
  );
}
