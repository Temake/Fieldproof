"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle, Info, WarningOctagon, X } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/lib/cx";

type ToastTone = "success" | "info" | "danger";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  push: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = {
  success: { Icon: CheckCircle, className: "text-verified" },
  info: { Icon: Info, className: "text-accent" },
  danger: { Icon: WarningOctagon, className: "text-blocking" },
};

/** Transient confirmations. Errors that need action stay inline instead. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.tone === "danger" ? 8000 : 5000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:right-6 sm:bottom-6 sm:left-auto"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const { Icon, className } = ICONS[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                role={toast.tone === "danger" ? "alert" : "status"}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-panel border border-line bg-surface p-4 shadow-float"
              >
                <Icon aria-hidden weight="fill" className={cx("mt-0.5 size-5 shrink-0", className)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-0.5 text-caption text-muted">{toast.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="-m-1 rounded-control p-1 text-muted transition-colors hover:bg-sunken hover:text-ink"
                >
                  <X aria-hidden className="size-4" weight="bold" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}
