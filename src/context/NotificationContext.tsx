import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { sanitizeLabel } from '../lib/labels';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

type NotificationItem = {
  id: string;
  type: NotificationType;
  message: string;
  durationMs: number;
};

type NotifyInput = {
  type?: NotificationType;
  message: string;
  durationMs?: number;
};

type NotificationContextType = {
  notify: (input: NotifyInput) => void;
  dismiss: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const iconByType: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <AlertCircle size={16} />,
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
};

const classByType: Record<NotificationType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300',
  error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/25 dark:text-red-300',
  info: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/25 dark:text-sky-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-300',
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const dismissTimerById = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const t = dismissTimerById.current.get(id);
    if (t !== undefined) {
      window.clearTimeout(t);
      dismissTimerById.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(({ type = 'info', message, durationMs }: NotifyInput) => {
    const trimmedMessage = sanitizeLabel(message).trim();
    if (!trimmedMessage) return;

    const resolvedDuration =
      durationMs ??
      (type === 'error' ? 9000 : type === 'warning' ? 6000 : 2600);

    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setItems((prev) => [...prev, { id, type, message: trimmedMessage, durationMs: resolvedDuration }]);

    const t = window.setTimeout(() => {
      dismissTimerById.current.delete(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, resolvedDuration);
    dismissTimerById.current.set(id, t);
  }, []);

  const value = useMemo<NotificationContextType>(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[85] flex w-[min(92vw,420px)] flex-col gap-2">
        {items.map(item => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto rounded-lg border px-3 py-2 shadow-sm backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2',
              classByType[item.type],
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5">{iconByType[item.type]}</span>
              <span className="flex-1 text-sm leading-5">{item.message}</span>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};
