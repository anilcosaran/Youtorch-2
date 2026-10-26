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
import { Field, FormError } from "./field";

interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Label of the text box. */
  label: string;
  placeholder?: string;
  /** The action can't be taken without text. */
  required?: boolean;
  action: string;
  destructive?: boolean;
  /** Resolves when done; a thrown error is shown in the dialog. */
  onSubmit: (text: string) => Promise<void>;
  /** Turns a failure into the message shown in the dialog. */
  describeError: (error: unknown) => string;
}

/** Reasons and notes are stored with the decision; the API takes up to 500 characters. */
const MAX_LENGTH = 500;

function ReasonForm({
  label,
  placeholder,
  required,
  action,
  destructive,
  onSubmit,
  describeError,
  onCancel,
}: Omit<ReasonDialogProps, "open" | "onOpenChange" | "title" | "description"> & {
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set at once, unlike `busy`, so a second Enter or click before the next render can't send it twice.
  const sending = useRef(false);
  const blocked = required && text.trim().length === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      // Done: the dialog closes, and stays unsendable until it does.
    } catch (err) {
      setError(describeError(err));
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <FormError message={error} />
      <Field id="reason" label={required ? label : `${label} (optional)`}>
        <Textarea
          id="reason"
          autoFocus
          required={required}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/⌘ Enter sends, so a decision needs no reach for the mouse; like the button, not while
            // it is sending or still needs text.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (!busy && !blocked) e.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          maxLength={MAX_LENGTH}
          className="min-h-24"
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy || blocked}>
          {busy && <LoaderCircle className="animate-spin" />}
          {action}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Asks for a reason or a note before an action that needs one. */
export function ReasonDialog({ open, onOpenChange, title, description, ...form }: ReasonDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* Mounted only while open, so every visit starts empty. */}
        {open && <ReasonForm {...form} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
