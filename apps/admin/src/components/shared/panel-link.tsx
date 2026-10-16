"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { usePanels } from "@/components/layout/panel-context";
import { PANEL_PERMISSIONS, panelHref, type PanelRef } from "@/lib/panel";
import { useSession } from "@/lib/session";

/** The current page with `to` open in its side panel; a new tab opens the same view. */
export function usePanelHref(to: PanelRef): string {
  const pathname = usePathname();
  const params = useSearchParams();
  return panelHref(pathname, params.toString(), to);
}

const plainClick = (event: React.MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * A link that opens an item, such as a request, in the side panel over
 * the current page. Operators who may not open it see the text alone.
 */
export function PanelLink({
  to,
  className,
  plainClassName,
  title,
  onOpen,
  children,
}: {
  to: PanelRef;
  className?: string;
  /** Classes for the text shown in place of the link. */
  plainClassName?: string;
  title?: string;
  /** Runs before the panel opens, e.g. to close a dialog the link sits in. */
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const { allows } = useSession();
  const { open } = usePanels();
  const href = usePanelHref(to);
  if (!allows(PANEL_PERMISSIONS[to.kind])) return <span className={plainClassName}>{children}</span>;
  return (
    <a
      href={href}
      title={title}
      className={className}
      onClick={(event) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        event.stopPropagation();
        onOpen?.();
        void open(to);
      }}
    >
      {children}
    </a>
  );
}

/**
 * The link inside a clickable row. A plain click is left to the row, which
 * opens the item in the panel; a click with a modifier key opens the same
 * view in a new tab or window as usual.
 */
export function PanelRowLink({
  to,
  className,
  title,
  children,
}: {
  to: PanelRef;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const href = usePanelHref(to);
  return (
    <a
      href={href}
      title={title}
      className={className}
      onClick={(event) => {
        if (plainClick(event)) event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
