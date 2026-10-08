"use client";

import { useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useConsole } from "@/providers/console-provider";
import type { Environment } from "@/types/workspace";

const envOptions: { value: Environment; label: string }[] = [
  { value: "live", label: "Live · billed" },
  { value: "test", label: "Test · free" },
];

export function CreateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);

  const close = () => {
    onClose();
    setSecret(null);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={secret ? "Save your key" : "Create API key"}
      description={secret ? undefined : "Give the key a name you'll recognise in logs."}
    >
      {secret ? <SecretReveal secret={secret} onDone={close} /> : <CreateKeyForm onCreated={setSecret} onCancel={close} />}
    </Dialog>
  );
}

function CreateKeyForm({ onCreated, onCancel }: { onCreated: (secret: string) => void; onCancel: () => void }) {
  const { createKey, env: currentEnv } = useConsole();
  const [name, setName] = useState("");
  const [env, setEnv] = useState<Environment>(currentEnv);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onCreated(createKey(name.trim() || "Untitled key", env));
      }}
    >
      <Field label="Name">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. production-backend" />
      </Field>
      <div>
        <span className="mb-1.5 block text-[13px] text-muted">Mode</span>
        <Segmented value={env} onChange={setEnv} options={envOptions} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="accent">
          Create key
        </Button>
      </div>
    </form>
  );
}

function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-ember-500/25 bg-ember-500/[0.07] p-3 text-[13.5px] text-ember-200">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        This is the only time the full key is shown. Store it in a secret manager, never in client-side code.
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-canvas p-2 pl-3">
        <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{secret}</code>
        <Button
          size="sm"
          variant={copied ? "secondary" : "primary"}
          onClick={async () => {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}
