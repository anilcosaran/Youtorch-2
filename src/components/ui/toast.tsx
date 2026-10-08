"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

type Toast = { id: number; message: string };

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string) => {
    const id = ++nextId.current;
    setToasts((current) => [...current.slice(-2), { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex animate-fade-up items-center gap-2 rounded-xl border border-line-strong bg-overlay/95 px-3.5 py-2.5 text-[14px] shadow-xl shadow-black/50 backdrop-blur"
          >
            <CheckCircle2 className="size-4 text-jade-400" />
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
