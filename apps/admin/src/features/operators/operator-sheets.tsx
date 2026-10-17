"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/data/states";
import { CopyButton } from "@/components/shared/copy-field";
import { Field, FormError } from "@/components/shared/field";
import { SidePanel } from "@/components/shared/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Operator } from "@/lib/api/auth";
import { errorMessage, fieldErrors } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { createOperator, getPermissionCatalog, updateOperator, type PermissionCatalog } from "@/lib/api/operators";
import { generatePassword, passwordProblem } from "@/lib/passwords";
import {
  accessRequest,
  changesAccess,
  choosePreset,
  CUSTOM,
  draftFor,
  isComplete,
  type AccessDraft,
} from "@/lib/permissions";
import { AccessEditor } from "./access-editor";

export function usePermissionCatalog() {
  return useQuery({ queryKey: keys.permissionCatalog, queryFn: getPermissionCatalog, staleTime: 30 * 60_000 });
}

/** The catalog, or its loading and failure states in its place. */
function WithCatalog({ children }: { children: (catalog: PermissionCatalog) => React.ReactNode }) {
  const catalog = usePermissionCatalog();
  if (catalog.data) return children(catalog.data);
  if (catalog.error) {
    return (
      <ErrorState
        error={catalog.error}
        onRetry={() => void catalog.refetch()}
        retrying={catalog.isFetching}
        title="Couldn't load the permissions"
        className="rounded-lg border"
      />
    );
  }
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-36 rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

/** A refusal of the role or permissions, for the editor; other fields have their own place. */
const accessError = (fields: Record<string, string>) => fields.permissions ?? fields.role;

/** The access a new operator starts with: the narrowest preset, else nothing ticked. */
function startingDraft(catalog: PermissionCatalog): AccessDraft {
  const viewer = catalog.presets.find((p) => p.id === "viewer") ?? catalog.presets.find((p) => p.role === "custom");
  return viewer ? choosePreset(viewer, catalog.permissions) : { choice: CUSTOM, role: "custom", permissions: [] };
}

function PasswordInput({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      id="operator-password"
      label="Password (optional)"
      error={error}
      hint="At least 12 characters. Leave it empty and one is made for you and shown once."
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="operator-password"
            type={shown ? "text" : "password"}
            autoComplete="new-password"
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={Boolean(error)}
            className="pr-16 font-mono"
          />
          <div className="absolute inset-y-0 right-1 flex items-center">
            {value && <CopyButton value={value} label="Password" />}
            <button
              type="button"
              onClick={() => setShown(!shown)}
              aria-label={shown ? "Hide password" : "Show password"}
              title={shown ? "Hide password" : "Show password"}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onChange(generatePassword());
            setShown(true);
          }}
        >
          <Sparkles /> Generate
        </Button>
      </div>
    </Field>
  );
}

function CreateForm({
  formId,
  catalog,
  onBusy,
  onCreated,
}: {
  formId: string;
  catalog: PermissionCatalog;
  onBusy: (busy: boolean) => void;
  onCreated: (operator: Operator, password: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [draft, setDraft] = useState(() => startingDraft(catalog));
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = passwordProblem(password);
    const local: Record<string, string> = {};
    if (problem) local.password = problem;
    if (!isComplete(draft)) local.permissions = "Tick at least one permission, or pick a preset.";
    setFields(local);
    setError(null);
    if (Object.keys(local).length > 0) return;
    onBusy(true);
    try {
      const result = await createOperator({
        name: name.trim(),
        email: email.trim(),
        password: password || undefined,
        ...accessRequest(draft),
      });
      void queryClient.invalidateQueries({ queryKey: keys.operators });
      onCreated(result.operator, result.password);
    } catch (err) {
      const byField = fieldErrors(err);
      setFields(byField);
      if (Object.keys(byField).length === 0) setError(errorMessage(err));
    } finally {
      onBusy(false);
    }
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-5">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="operator-name" label="Name" error={fields.name}>
          <Input
            id="operator-name"
            required
            autoFocus
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(fields.name)}
          />
        </Field>
        <Field id="operator-email" label="Email" error={fields.email}>
          <Input
            id="operator-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fields.email)}
          />
        </Field>
      </div>
      <PasswordInput value={password} onChange={setPassword} error={fields.password} />
      <AccessEditor catalog={catalog} value={draft} onChange={setDraft} error={accessError(fields)} />
    </form>
  );
}

/** Adds an operator: who they are, how they sign in, and what they may do. */
export function CreateOperatorSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** `password` is the generated one, shown once; null when it was chosen here. */
  onCreated: (operator: Operator, password: string | null) => void;
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Add an operator"
      description="They sign in to this console with this email and password."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />}
            Add operator
          </Button>
        </div>
      }
    >
      {/* Mounted only while open, so every visit starts empty. */}
      {open && (
        <WithCatalog>
          {(catalog) => <CreateForm formId={formId} catalog={catalog} onBusy={setBusy} onCreated={onCreated} />}
        </WithCatalog>
      )}
    </SidePanel>
  );
}

function EditForm({
  formId,
  operator,
  self,
  catalog,
  onBusy,
  onChanged,
  onSaved,
}: {
  formId: string;
  operator: Operator;
  self: boolean;
  catalog: PermissionCatalog;
  onBusy: (busy: boolean) => void;
  onChanged: (changed: boolean) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => draftFor(operator, catalog.presets, catalog.permissions));
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const change = (next: AccessDraft) => {
    setDraft(next);
    onChanged(changesAccess(next, operator));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!isComplete(draft)) {
      setFields({ permissions: "Tick at least one permission, or pick a preset." });
      return;
    }
    setFields({});
    onBusy(true);
    try {
      const updated = await updateOperator(operator.id, accessRequest(draft));
      queryClient.setQueryData<Operator[]>(keys.operators, (list) =>
        list?.map((o) => (o.id === updated.id ? updated : o)),
      );
      toast.success(`${updated.name}'s access is saved`, { description: "It applies to their open sessions at once." });
      onSaved();
    } catch (err) {
      const byField = fieldErrors(err);
      setFields(byField);
      if (!accessError(byField)) setError(errorMessage(err));
    } finally {
      onBusy(false);
    }
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="grid gap-5">
      {self && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          You can&apos;t change your own access, so nobody locks themselves out by mistake. Another admin can change it
          for you.
        </p>
      )}
      <FormError message={error} />
      <AccessEditor catalog={catalog} value={draft} onChange={change} disabled={self} error={accessError(fields)} />
    </form>
  );
}

/** Changes what an operator may do; their own access is read-only. */
export function EditAccessSheet({
  operator,
  self,
  onClose,
}: {
  operator: Operator | null;
  self: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const close = () => {
    setChanged(false);
    onClose();
  };
  return (
    <SidePanel
      open={operator !== null}
      onClose={close}
      title={operator ? `${operator.name}'s access` : "Access"}
      description={operator?.email}
      footer={
        self ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={close}>
              Close
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={busy || !changed}>
              {busy && <LoaderCircle className="animate-spin" />}
              Save access
            </Button>
          </div>
        )
      }
    >
      {operator && (
        <WithCatalog>
          {(catalog) => (
            <EditForm
              key={operator.id}
              formId={formId}
              operator={operator}
              self={self}
              catalog={catalog}
              onBusy={setBusy}
              onChanged={setChanged}
              onSaved={close}
            />
          )}
        </WithCatalog>
      )}
    </SidePanel>
  );
}
