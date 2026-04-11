import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending((prev) => {
        if (prev) prev.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  const handleCancel = useCallback(() => {
    setPending((prev) => {
      if (prev) prev.resolve(false);
      return null;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setPending((prev) => {
      if (prev) prev.resolve(true);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending, handleCancel]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={handleCancel}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="section-card w-full max-w-md p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              {pending.title}
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400 whitespace-pre-wrap">{pending.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={handleCancel} className="action-btn-secondary">
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className={
                  pending.danger
                    ? 'rounded-lg border border-red-200 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 dark:border-red-900 dark:bg-red-700 dark:hover:bg-red-600'
                    : 'action-btn-primary'
                }
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}
