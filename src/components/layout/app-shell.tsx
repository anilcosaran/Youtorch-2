"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { BillingDialogs } from "@/features/billing/components/billing-dialogs";
import { ConsoleProvider } from "@/providers/console-provider";
import { CommandMenu } from "./command-menu";
import { ShellFrame } from "./shell-frame";
import { SidePanelProvider } from "./side-panel";

/** Console chrome: client providers, the sidebar frame and the global overlays. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ConsoleProvider>
      <ToastProvider>
        <SidePanelProvider>
          <ShellFrame>{children}</ShellFrame>
          <CommandMenu />
          <BillingDialogs />
        </SidePanelProvider>
      </ToastProvider>
    </ConsoleProvider>
  );
}
