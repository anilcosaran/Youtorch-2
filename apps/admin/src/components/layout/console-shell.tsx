"use client";

import { Suspense, type ReactNode } from "react";
import { SessionProvider } from "@/lib/session";
import { CommandPaletteProvider } from "./command-palette";
import { PanelProvider } from "./panel-context";
import { PanelHost } from "./panel-host";
import { Sidebar } from "./sidebar";

/** The signed-in console: session, sidebar, command palette, the current screen and the side panel over it. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <CommandPaletteProvider>
        <PanelProvider>
          <div className="flex h-dvh bg-sidebar">
            <Sidebar />
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:my-2 lg:mr-2 lg:rounded-xl lg:border lg:shadow-xs">
              {children}
            </main>
          </div>
          <Suspense fallback={null}>
            <PanelHost />
          </Suspense>
        </PanelProvider>
      </CommandPaletteProvider>
    </SessionProvider>
  );
}
