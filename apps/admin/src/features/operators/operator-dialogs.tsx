"use client";

import { CopyField } from "@/components/shared/copy-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** A password the server returned once: copy it now or it's gone. */
export function PasswordDialog({
  open,
  onOpenChange,
  title,
  password,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  password: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            This password is shown once. Share it privately; they can change it after signing in.
          </DialogDescription>
        </DialogHeader>
        <CopyField value={password} label="Password" />
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
