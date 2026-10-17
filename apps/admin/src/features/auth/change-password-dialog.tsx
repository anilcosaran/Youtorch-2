"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormError } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { changePassword } from "@/lib/api/auth";
import { errorMessage, fieldErrors } from "@/lib/api/client";

const MIN_PASSWORD = 12;

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD;
  const same = next.length > 0 && next === current;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch || tooShort || same) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      toast.success("Password changed", { description: "Your other sessions were signed out." });
      onDone();
    } catch (err) {
      const byField = fieldErrors(err);
      setFields(byField);
      if (Object.keys(byField).length === 0) setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field id="current-password" label="Current password" error={fields.currentPassword}>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          aria-invalid={Boolean(fields.currentPassword)}
        />
      </Field>
      <Field
        id="new-password"
        label="New password"
        hint={`At least ${MIN_PASSWORD} characters.`}
        error={
          fields.newPassword ??
          (tooShort
            ? `Use at least ${MIN_PASSWORD} characters.`
            : same
              ? "Choose a password different from the current one."
              : undefined)
        }
      >
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-invalid={Boolean(fields.newPassword) || tooShort || same}
        />
      </Field>
      <Field
        id="confirm-password"
        label="Repeat new password"
        error={mismatch ? "The passwords don't match." : undefined}
      >
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || mismatch || tooShort || same}>
          {busy && <LoaderCircle className="animate-spin" />}
          Change password
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Your other sessions end when the password changes.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every visit starts empty. */}
        {open && <PasswordForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
