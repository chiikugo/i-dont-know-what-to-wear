/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  state/ToastContext.tsx — little pop-up messages ("Saved to your closet")
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  HOW TO USE
 *      const toast = useToast();
 *      toast.push({ message: "Saved to your closet", actionLabel: "View",
 *                   onAction: () => navigate("closet") });
 *
 *  REACT CONCEPT: CONTEXT
 *  Normally data flows parent → child through props. A *context* lets any
 *  component deep in the tree reach a shared value without passing it through
 *  every level. `ToastProvider` owns the list of toasts; `useToast()` lets any
 *  component add one.
 *
 *  The toasts are drawn by <ToastViewport/>, which this provider renders
 *  itself, so the rest of the app never has to think about them.
 */

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/** What you pass to `push`. */
export interface ToastInput {
  message: string;
  /** Optional button on the toast (e.g. "Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  /** How long it stays, in ms. Default 4500. */
  duration?: number;
}

interface Toast extends ToastInput {
  id: number;
}

interface ToastApi {
  push: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Wrap the app in this once (see main.tsx / App.tsx). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { ...input, id }]); // keep at most 3
      window.setTimeout(() => dismiss(id), input.duration ?? 4500);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="false">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              className="toast"
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              <span>{toast.message}</span>
              {toast.actionLabel && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    toast.onAction?.();
                    dismiss(toast.id);
                  }}
                >
                  {toast.actionLabel}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/** Get the `push` function. Must be used under <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
