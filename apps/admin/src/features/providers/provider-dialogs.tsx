"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/shared/field";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage, fieldErrors } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import {
  ADAPTERS,
  createProvider,
  PROVIDER_KINDS,
  setProviderCredential,
  updateProvider,
  type Adapter,
  type Provider,
  type ProviderKind,
} from "@/lib/api/providers";
import { ID_PART } from "@/lib/catalog";
import { ADAPTER_LABELS, PROVIDER_KIND_DESCRIPTIONS, PROVIDER_KIND_LABELS } from "@/lib/labels";

function useStoreProvider() {
  const queryClient = useQueryClient();
  return (provider: Provider) =>
    queryClient.setQueryData<Provider[]>(keys.providers, (list) => {
      if (!list) return list;
      return list.some((p) => p.id === provider.id)
        ? list.map((p) => (p.id === provider.id ? provider : p))
        : [...list, provider];
    });
}

/** A number field's value, or null when it is empty. */
const optional = (text: string) => (text.trim() ? Number(text) : null);

function ProviderForm({ provider, onDone }: { provider: Provider | null; onDone: () => void }) {
  const store = useStoreProvider();
  const [id, setId] = useState(provider?.id ?? "");
  const [name, setName] = useState(provider?.name ?? "");
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? "aggregator");
  const [adapter, setAdapter] = useState<Adapter>(provider?.adapter ?? "http");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "https://");
  const [regions, setRegions] = useState<string[]>(provider?.regions ?? ["global"]);
  const [concurrency, setConcurrency] = useState(provider?.limits.concurrency?.toString() ?? "");
  const [rpm, setRpm] = useState(provider?.limits.requestsPerMinute?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const idError = id && !ID_PART.test(id) ? "Lowercase letters, digits, dots and dashes." : fields.id;
  const urlError = /^https:\/\/.+/.test(baseUrl) ? fields.baseUrl : "An https:// URL.";
  const invalid = !id || !name.trim() || Boolean(idError) || Boolean(urlError);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      let saved: Provider;
      if (provider) {
        saved = await updateProvider(provider.id, {
          name: name.trim(),
          baseUrl,
          regions,
          limits: { concurrency: optional(concurrency), requestsPerMinute: optional(rpm) },
        });
      } else {
        saved = await createProvider({ id, name: name.trim(), kind, adapter, baseUrl, regions });
      }
      store(saved);
      toast.success(provider ? "Provider saved" : `${saved.name} added`, {
        description: provider ? undefined : "Set its key, then add routes to it from a model's routing tab.",
      });
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
        <Field id="provider-name" label="Name" error={fields.name}>
          <Input id="provider-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="fal" />
        </Field>
        <Field id="provider-id" label="ID" hint={provider ? "Can't change." : "Used in routes and logs."} error={idError}>
          <Input
            id="provider-id"
            required
            value={id}
            disabled={provider !== null}
            onChange={(e) => setId(e.target.value.toLowerCase().trim())}
            className="font-mono"
          />
        </Field>
      </div>
      {!provider && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="provider-kind" label="Kind" hint={PROVIDER_KIND_DESCRIPTIONS[kind]}>
            <Select value={kind} onValueChange={(value) => setKind(value as ProviderKind)}>
              <SelectTrigger id="provider-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PROVIDER_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="provider-adapter" label="Adapter" hint="The wire protocol the gateway speaks to it.">
            <Select value={adapter} onValueChange={(value) => setAdapter(value as Adapter)}>
              <SelectTrigger id="provider-adapter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADAPTERS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {ADAPTER_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}
      <Field id="provider-url" label="Base URL" error={baseUrl.length > 8 ? urlError : fields.baseUrl}>
        <Input id="provider-url" required value={baseUrl} onChange={(e) => setBaseUrl(e.target.value.trim())} className="font-mono" />
      </Field>
      <Field id="provider-regions" label="Regions" hint="Where it runs: global, us, eu, apac.">
        <TagInput id="provider-regions" value={regions} onChange={setRegions} normalize={(t) => t.trim().toLowerCase()} />
      </Field>
      {provider && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="provider-concurrency" label="Max in flight" hint="Across every route; empty for no cap.">
            <Input id="provider-concurrency" type="number" min={1} value={concurrency} onChange={(e) => setConcurrency(e.target.value)} />
          </Field>
          <Field id="provider-rpm" label="Requests per minute" hint="Empty for no cap.">
            <Input id="provider-rpm" type="number" min={1} value={rpm} onChange={(e) => setRpm(e.target.value)} />
          </Field>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || invalid}>
          {busy && <LoaderCircle className="animate-spin" />}
          {provider ? "Save" : "Add provider"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Adds a provider, or edits one's endpoint, regions and limits. */
export function ProviderDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: Provider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{provider ? `Edit ${provider.name}` : "Add a provider"}</DialogTitle>
          <DialogDescription>
            {provider
              ? "Limits apply across every route through this provider."
              : "A provider needs an adapter the gateway already speaks. Adding a new protocol is a code change."}
          </DialogDescription>
        </DialogHeader>
        {open && <ProviderForm provider={provider} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CredentialForm({ provider, onDone }: { provider: Provider; onDone: () => void }) {
  const store = useStoreProvider();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      store(await setProviderCredential(provider.id, secret.trim()));
      toast.success(`${provider.name} key saved`, { description: "New attempts use it at once." });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field id="provider-secret" label="API key" hint="Stored encrypted. Only its last characters are shown afterwards.">
        <Input
          id="provider-secret"
          type="password"
          autoComplete="off"
          required
          autoFocus
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="font-mono"
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || secret.trim().length < 8}>
          {busy && <LoaderCircle className="animate-spin" />}
          Save key
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Sets or rotates the key the gateway uses with a provider. Write-only. */
export function CredentialDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: Provider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{provider.credential.configured ? `Rotate the ${provider.name} key` : `Set the ${provider.name} key`}</DialogTitle>
          <DialogDescription>
            {provider.credential.source === "environment"
              ? "A key set here replaces the one from the environment."
              : "Revoke the old key at the provider once requests succeed with the new one."}
          </DialogDescription>
        </DialogHeader>
        {open && <CredentialForm provider={provider} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
