"use client";

import { Dialog } from "@/components/ui/dialog";
import { useConsole } from "@/providers/console-provider";
import { AddCardForm } from "./dialogs/add-card-form";
import { AddFundsForm } from "./dialogs/add-funds-form";
import { AutoReloadForm } from "./dialogs/auto-reload-form";

/** Mounted once in the shell so any page can open billing flows through `openDialog`. */
export function BillingDialogs() {
  const { dialog, openDialog } = useConsole();
  const close = () => openDialog(null);
  return (
    <>
      <Dialog
        open={dialog === "add-funds"}
        onClose={close}
        title="Add credits"
        description="Credits never expire and are shared across your workspace."
      >
        <AddFundsForm onDone={close} />
      </Dialog>
      <Dialog
        open={dialog === "auto-reload"}
        onClose={close}
        title="Auto reload"
        description="Keep requests flowing by topping up automatically when your balance runs low."
      >
        <AutoReloadForm onDone={close} />
      </Dialog>
      <Dialog open={dialog === "add-card"} onClose={close} title="Add payment method">
        <AddCardForm onDone={close} />
      </Dialog>
    </>
  );
}
