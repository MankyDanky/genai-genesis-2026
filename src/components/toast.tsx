"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";

type ToastType = "success" | "error";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 3500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-stretch bg-[var(--color-surface)] border border-[var(--color-border-light)] shadow-[0_8px_24px_rgba(0,0,0,0.5)] min-w-[280px] max-w-[380px]"
            style={{ animation: "toastSlideIn 0.2s ease-out" }}
          >
            <div
              className="w-[3px] shrink-0"
              style={{
                background:
                  toast.type === "success"
                    ? "var(--color-success)"
                    : "var(--color-danger)",
              }}
            />
            <p className="px-3 py-2.5 text-[11px] text-[var(--color-text)] tracking-wide leading-relaxed">
              {toast.message}
            </p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
