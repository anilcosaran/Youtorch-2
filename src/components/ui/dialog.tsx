"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, footer, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-auto w-[min(92vw,460px)] overflow-visible bg-transparent p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm open:animate-pop",
        className,
      )}
    >
      {open && (
        <div className="relative surface bg-raised shadow-2xl shadow-black/60">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-md text-subtle transition hover:bg-white/5 hover:text-fg"
          >
            <X className="size-4" />
          </button>
          {(title || description) && (
            <div className="px-5 pt-5 pb-1">
              {title && <h2 className="text-[16px] font-semibold">{title}</h2>}
              {description && <p className="mt-1 text-[14px] text-muted">{description}</p>}
            </div>
          )}
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
