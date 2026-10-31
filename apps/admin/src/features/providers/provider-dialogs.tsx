"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@modelvend/admin-api/client";
import {
  ADAPTERS,
  createProvider,
  PROVIDER_KINDS,
  setProviderCredential,
  updateProvider,
  type Adapter,
  type Provider,
  type ProviderKind,
} from "@modelvend/admin-api/providers";
import { Field, FormError } from "@/components/shared/field";
import { TagInput } from "@/components/shared/tag-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ID_PART } from "@/lib/catalog";
import { ADAPTER_LABELS, PROVIDER_KIND_DESCRIPTIONS, PROVIDER_KIND_LABELS } from "@/lib/labels";
import { formErrors } from "@/lib/notify";
import { keys } from "@/lib/query-keys";

function useStoreProvider() {
  const queryClient = useQueryClient();
  return (provider: Provider) => {
    queryClient.setQueryData<Provider[]>(keys.providers, (list) => {
      if (!list) return list;
      return list.some((p) => p.id === provider.id)
        ? list.map((p) => (p.id === provider.id ? provider : p))
        : [...list, provider];
    });
    void queryClient.invalidateQueries({ queryKey: keys.audit });
  };
}

/** A number field's value, or null when it is empty. */
const optional = (text: string) => (text.trim() ? Number(text) : null);

/** The URL as the server stores it, without trailing slashes. */
const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, "");

/** The host of an https:// URL, or the URL itself when it doesn't parse. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const MIN_SECRET = 8;

function ProviderForm({ provider, onDone }: { provider: Provider | null; onDone: () => void }) {
  const store = useStoreProvider();
  const [id, setId] = useState(provider?.id ?? "");
  const [name, setName] = useState(provider?.name ?? "");
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? "first_party");
  const [adapter, setAdapter] = useState<Adapter>(provider?.adapter ?? "google");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "https://");
  const [secret, setSecret] = useState("");
  const [regions, setRegions] = useState<string[]>(provider?.regions ?? ["global"]);
  const [concurrency, setConcurrency] = useState(provider?.limits.concurrency?.toString() ?? "");
  const [rpm, setRpm] = useState(provider?.limits.requestsPerMinute?.toString() ?? "");
  const [whiteLabelAllowed, setWhiteLabelAllowed] = useState(provider?.whiteLabelAllowed ?? false);
  const [licenseNotes, setLicenseNotes] = useState(provider?.licenseNotes ?? "");
  // Moving an existing provider to another endpoint asks once more before saving.
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  // The stored key goes only to the endpoint it was entered for, so a move needs it again.
  const moves = provider !== null && normalizeUrl(baseUrl) !== provider.baseUrl;
  const needsSecret = moves && provider.credential.configured;
  const idError = id && !ID_PART.test(id) ? "Lowercase letters, digits, dots and dashes." : fields.id;
  const urlError = /^https:\/\/.+/.test(baseUrl) ? fields.baseUrl : "An https:// URL.";
  const secretMissing = needsSecret && secret.trim().length < MIN_SECRET;
  const invalid = !id || !name.trim() || Boolean(idError) || Boolean(urlError) || secretMissing;

  const editUrl = (value: string) => {
    setBaseUrl(value.trim());
    setConfirming(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    if (moves && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let saved: Provider;
      if (provider) {
        saved = await updateProvider(provider.id, {
          name: name.trim(),
          baseUrl,
          ...(needsSecret ? { secret: secret.trim() } : {}),
          regions,
          whiteLabelAllowed,
          licenseNotes: licenseNotes.trim(),
          limits: { concurrency: optional(concurrency), requestsPerMinute: optional(rpm) },
        });
      } else {
        saved = await createProvider({ id, name: name.trim(), kind, adapter, baseUrl, regions, whiteLabelAllowed, licenseNotes: licenseNotes.trim() });
      }
      store(saved);
      toast.success(provider ? "Provider saved" : `${saved.name} added`, {
        description: provider
          ? moves
            ? `New attempts go to ${hostOf(saved.baseUrl)}.`
            : undefined
          : "It starts disabled: set its key, then enable it.",
      });
      onDone();
    } catch (err) {
      // Errors on fields this form has no place for (regions, limits) go in the form error.
      const shown = formErrors(err, ["id", "name", "baseUrl", "secret", "licenseNotes"], {
        "limits.concurrency": "Max in flight",
        "limits.requestsPerMinute": "Requests per minute",
      });
      setFields(shown.fields);
      setError(shown.message);
      setConfirming(false);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="provider-name" label="Name" error={fields.name}>
          <Input id="provider-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Google" />
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
        <Input id="provider-url" required value={baseUrl} onChange={(e) => editUrl(e.target.value)} className="font-mono" />
      </Field>
      {needsSecret && (
        <Field
          id="provider-move-secret"
          label="API key"
          hint={`The stored key stays with ${hostOf(provider.baseUrl)}. Enter the key to use with ${hostOf(normalizeUrl(baseUrl))}; it replaces the stored one.`}
          error={fields.secret}
        >
          <Input
            id="provider-move-secret"
            type="password"
            autoComplete="off"
            required
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              setConfirming(false);
            }}
            className="font-mono"
            aria-invalid={Boolean(fields.secret)}
          />
        </Field>
      )}
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
      <label className="flex items-start justify-between gap-4 text-sm">
        <span>
          <span className="block font-medium">White label allowed</span>
          <span className="block text-xs text-muted-foreground">Whether its terms let us resell its models under our own name.</span>
        </span>
        <Switch checked={whiteLabelAllowed} onCheckedChange={setWhiteLabelAllowed} />
      </label>
      <Field id="provider-license" label="License notes" hint="What its terms say, for whoever adds models to it." error={fields.licenseNotes}>
        <Textarea id="provider-license" value={licenseNotes} onChange={(e) => setLicenseNotes(e.target.value)} className="min-h-16" />
      </Field>
      {confirming && provider && (
        <div role="alert" className="grid gap-1 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2.5 text-sm">
          <p className="font-medium">
            Send {provider.name}&apos;s traffic to {hostOf(normalizeUrl(baseUrl))}?
          </p>
          <p className="text-muted-foreground">
            Every attempt through its routes goes to <span className="font-mono break-all">{normalizeUrl(baseUrl)}</span>
            {needsSecret ? ", with the key entered above" : ""}. Whoever runs that address sees our requests and customers&apos;
            inputs, so check it before you save.
          </p>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={confirming ? () => setConfirming(false) : onDone}>
          {confirming ? "Back" : "Cancel"}
        </Button>
        <Button type="submit" variant={confirming ? "destructive" : "default"} disabled={busy || invalid}>
          {busy && <LoaderCircle className="animate-spin" />}
          {provider ? (confirming ? "Change endpoint" : "Save") : "Add provider"}
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
      <DialogContent className="scroll-thin max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{provider ? `Edit ${provider.name}` : "Add a provider"}</DialogTitle>
          <DialogDescription>
            {provider
              ? "Limits apply across every route through this provider."
              : "A provider needs an adapter the gateway already speaks; adding a new protocol is a code change. It starts disabled."}
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
            {provider.credential.configured
              ? "Revoke the old key at the provider once attempts succeed with the new one."
              : "The gateway uses it for every attempt through this provider. Enable the provider afterwards."}
          </DialogDescription>
        </DialogHeader>
        {open && <CredentialForm provider={provider} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
