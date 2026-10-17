"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, fieldErrors } from "@/lib/api/client";
import { createVersion, deprecateVersion, type Model, type ModelVersion } from "@/lib/api/models";
import { ID_PART, nextVersionId } from "@/lib/catalog";
import { useApplyModel } from "./use-model-action";

const BLANK = "__blank";

function NewVersionForm({ model, onDone }: { model: Model; onDone: () => void }) {
  const apply = useApplyModel();
  const [id, setId] = useState(() => nextVersionId(model.versionList.map((v) => v.id)));
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState(model.defaultVersion ?? model.versionList[0]?.id ?? BLANK);
  const [changelog, setChangelog] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const idError = id && !ID_PART.test(id) ? "Lowercase letters, digits, dots and dashes." : fields.id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await createVersion(model.id, {
        id,
        label: label.trim() || id,
        from: from === BLANK ? undefined : from,
        changelog: changelog.trim() || undefined,
      });
      apply(updated);
      toast.success(`${id} created as a draft`);
      onDone();
    } catch (err) {
      setFields(fieldErrors(err));
      setError(Object.keys(fieldErrors(err)).length ? null : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="version-id" label="Version ID" hint={`Pinned as ${model.id}@${id || "…"}`} error={idError}>
          <Input id="version-id" required autoFocus value={id} onChange={(e) => setId(e.target.value.trim())} className="font-mono" />
        </Field>
        <Field id="version-label" label="Label" hint="What people call it, e.g. 3.1">
          <Input id="version-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={id} />
        </Field>
      </div>
      <Field id="version-from" label="Start from" hint="Copies the schema, price, routing and routes. You can change all of it before it goes live.">
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger id="version-from" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {model.versionList.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                <span className="font-mono">{v.id}</span> <span className="text-muted-foreground">{v.label}</span>
              </SelectItem>
            ))}
            <SelectItem value={BLANK}>Nothing, start blank</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field id="version-changelog" label="Changelog" hint="What changed for callers. Shown in the catalog and in deprecation notices.">
        <Textarea id="version-changelog" value={changelog} onChange={(e) => setChangelog(e.target.value)} className="min-h-20" />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !id || Boolean(idError)}>
          {busy && <LoaderCircle className="animate-spin" />}
          Create draft
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Starts a new draft version, usually copied from the live one. */
export function NewVersionDialog({ model, open, onOpenChange }: { model: Model; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New version of {model.name}</DialogTitle>
          <DialogDescription>
            It starts as a draft nobody can call. Promote it to staging to test it with internal keys, then put it live.
          </DialogDescription>
        </DialogHeader>
        {open && <NewVersionForm model={model} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** `YYYY-MM-DD`, `days` from today. */
function dateFromToday(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

const NONE = "__none";

function DeprecateForm({ model, version, onDone }: { model: Model; version: ModelVersion; onDone: () => void }) {
  const apply = useApplyModel();
  const replacements = model.versionList.filter((v) => v.status === "live" && v.id !== version.id);
  const [sunset, setSunset] = useState(() => dateFromToday(90));
  const [replacement, setReplacement] = useState(model.defaultVersion ?? replacements[0]?.id ?? NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooSoon = sunset < dateFromToday(1);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await deprecateVersion(model.id, version.id, {
        sunsetAt: new Date(`${sunset}T00:00:00Z`).toISOString(),
        replacement: replacement === NONE ? null : replacement,
      });
      apply(updated);
      toast.success(`${version.id} is deprecated`, { description: `It stops answering on ${sunset}.` });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sunset" label="Sunset date" hint="Give callers at least 30 days." error={tooSoon ? "Pick a date after today." : undefined}>
          <Input id="sunset" type="date" required value={sunset} min={dateFromToday(1)} onChange={(e) => setSunset(e.target.value)} />
        </Field>
        <Field id="replacement" label="Replacement" hint="Named in the Deprecation header and used after retirement.">
          <Select value={replacement} onValueChange={setReplacement}>
            <SelectTrigger id="replacement" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {replacements.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="font-mono">{v.id}</span> <span className="text-muted-foreground">{v.label}</span>
                </SelectItem>
              ))}
              <SelectItem value={NONE}>No replacement</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Until the sunset date, responses carry <code className="font-mono">Deprecation</code> and{" "}
        <code className="font-mono">Sunset</code> headers and workspaces that called it in the last 30 days get an email. Retire it
        after the sunset date.
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || tooSoon}>
          {busy && <LoaderCircle className="animate-spin" />}
          Deprecate
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Schedules a live version's end: a sunset date and where callers should go. */
export function DeprecateDialog({ model, version, onClose }: { model: Model; version: ModelVersion | null; onClose: () => void }) {
  return (
    <Dialog open={version !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Deprecate {version?.id}?</DialogTitle>
          <DialogDescription>It keeps answering until the sunset date, so pinned callers have time to move.</DialogDescription>
        </DialogHeader>
        {version && <DeprecateForm model={model} version={version} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
