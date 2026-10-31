"use client";

import { LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formErrors, lowMarginMessage } from "@/lib/notify";
import { Field, FormError } from "./field";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  action: string;
  /** Resolves when done; a thrown error is shown in the dialog. A reason only goes along after the server asked for one. */
  onPublish: (reason: string | undefined) => Promise<void>;
}

function PublishForm({ action, onPublish, onCancel }: Pick<PublishDialogProps, "action" | "onPublish"> & { onCancel: () => void }) {
  // What the server said is under the minimum margin; from then on publishing needs a reason.
  const [asked, setAsked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set at once, unlike `busy`, so a second click before the next render can't send it twice.
  const sending = useRef(false);
  const blocked = asked !== null && reason.trim().length === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onPublish(reason.trim() || undefined);
      // Done: the dialog closes, and stays unsendable until it does.
    } catch (err) {
      const thin = lowMarginMessage(err);
      if (thin) setAsked(thin);
      // Every other refusal says what to fix; its fields name where.
      else setError(formErrors(err, []).message);
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      {asked && (
        <div role="alert" className="grid gap-3 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2.5 text-sm">
          <p>{asked}</p>
          <Field id="publish-reason" label="Reason" hint="Kept in the audit log.">
            <Textarea
              id="publish-reason"
              autoFocus
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              className="min-h-16 bg-background"
            />
          </Field>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || blocked}>
          {busy && <LoaderCircle className="animate-spin" />}
          {action}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Puts a draft live. The server has the last word: under the minimum margin it asks for a reason (422
 * `low_margin`), and any other refusal, such as 403 `below_cost`, is shown here as it says it.
 */
export function PublishDialog({ open, onOpenChange, title, description, action, onPublish }: PublishDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* Mounted only while open, so every visit starts without a reason. */}
        {open && <PublishForm action={action} onPublish={onPublish} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
