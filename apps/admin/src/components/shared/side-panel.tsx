"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { usePanels } from "@/components/layout/panel-context";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isTypingTarget, neighbours, stepKey } from "@/lib/panel";

function IconButton({
  label,
  hint,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {hint && <kbd className="ml-2 font-sans opacity-70">{hint}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The sheet on the right that items open in, over whatever page is on
 * screen. One sheet serves every kind of item, so moving from one item to
 * another swaps the content instead of sliding a second sheet in.
 */
export function PanelSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        ref={content}
        side="right"
        showCloseButton={false}
        overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-none"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[720px]"
        onOpenAutoFocus={(event) => {
          // The body takes focus, so the keys and scrolling work at once without a ring on a button.
          event.preventDefault();
          content.current?.querySelector<HTMLElement>("[data-panel-body]")?.focus({ preventScroll: true });
        }}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

interface SidePanelProps {
  title: ReactNode;
  /** One line under the title; also the panel's accessible description. */
  description?: ReactNode;
  /** Pills under the title. */
  meta?: ReactNode;
  /** Links and buttons at the right of the header. */
  actions?: ReactNode;
  /** Pinned under the body, for the panel's main actions. */
  footer?: ReactNode;
  onStep?: (step: 1 | -1) => void;
  canStep?: { previous: boolean; next: boolean };
  children: ReactNode;
}

/**
 * The layout of an item in the side panel. The header and footer stay put
 * while the body scrolls; with `onStep`, J/K or ↑/↓ move to the next or
 * previous item of the list on screen. Escape and the close button close it.
 *
 * Items the URL opens render inside the console's one panel sheet. With
 * `open` and `onClose` it brings its own sheet instead, for forms that
 * belong to one page (adding an operator, for example).
 */
export function SidePanel({
  open,
  onClose,
  ...props
}: SidePanelProps & { open?: boolean; onClose?: () => void }) {
  if (open === undefined) return <PanelLayout {...props} />;
  return (
    <PanelSheet open={open} onClose={() => onClose?.()}>
      <PanelLayout {...props} onClose={onClose} />
    </PanelSheet>
  );
}

function PanelLayout({
  title,
  description,
  meta,
  actions,
  footer,
  onStep,
  canStep = { previous: false, next: false },
  onClose,
  children,
}: SidePanelProps & { onClose?: () => void }) {
  const panels = usePanels();
  const close = onClose ?? (() => void panels.close());
  const body = useRef<HTMLDivElement>(null);

  // Another kind of item replaced the one that had focus: the new body takes it.
  useEffect(() => {
    const element = body.current;
    if (element && !element.closest("[role=dialog]")?.contains(document.activeElement)) {
      element.focus({ preventScroll: true });
    }
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!onStep || event.defaultPrevented || isTypingTarget(event.target)) return;
    const step = stepKey(event);
    if (!step) return;
    event.preventDefault();
    if (step === 1 ? canStep.next : canStep.previous) onStep(step);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <header className="flex shrink-0 flex-col gap-2 border-b px-5 pt-4 pb-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base leading-snug font-semibold">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="mt-0.5 truncate text-xs">{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">Details</SheetDescription>
            )}
          </div>
          <div className="-mt-1 -mr-2 flex shrink-0 items-center">
            {onStep && (
              <>
                <IconButton label="Previous" hint="K" disabled={!canStep.previous} onClick={() => onStep(-1)}>
                  <ChevronUp />
                </IconButton>
                <IconButton label="Next" hint="J" disabled={!canStep.next} onClick={() => onStep(1)}>
                  <ChevronDown />
                </IconButton>
              </>
            )}
            <IconButton label="Close" hint="Esc" onClick={close}>
              <X />
            </IconButton>
          </div>
        </div>
        {(meta || actions) && (
          <div className="flex flex-wrap items-center gap-2">
            {meta}
            {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        )}
      </header>
      <div
        ref={body}
        data-panel-body
        tabIndex={-1}
        className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 outline-none [&>*]:shrink-0"
      >
        {children}
      </div>
      {footer && <footer className="shrink-0 border-t bg-popover px-5 py-3">{footer}</footer>}
    </div>
  );
}

/** Stepping through `ids` from `id`: the handler and which way is open, or nothing when `id` isn't on the list. */
export function listStepping(
  ids: readonly string[],
  id: string,
  onOpen: (id: string | null) => void,
): { onStep?: (step: 1 | -1) => void; canStep?: { previous: boolean; next: boolean } } {
  const around = neighbours(ids, id);
  if (!around) return {};
  return {
    onStep: (step) => onOpen(step === 1 ? around.next : around.previous),
    canStep: { previous: around.previous !== null, next: around.next !== null },
  };
}
