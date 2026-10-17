"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  /** Label of the confirming button. */
  action: string;
  destructive?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(() =>
  Promise.resolve(false),
);

/** Asks before something that cannot be undone: `if (await confirm({...})) …`. */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  // The last question stays in place while the dialog animates out.
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
        setOpen(true);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    if (open) pending?.resolve(ok);
    setOpen(false);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            {pending?.description && <DialogDescription>{pending.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              Cancel
            </Button>
            <Button
              variant={pending?.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {pending?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
