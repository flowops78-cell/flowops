import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-4 py-10', className)}>
      {icon ? <div className="mb-3 text-stone-400 dark:text-stone-500">{icon}</div> : null}
      <h4 className="text-base font-medium text-stone-900 dark:text-stone-100">{title}</h4>
      <p className="mt-1 max-w-md text-sm text-stone-500 dark:text-stone-400">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="action-btn-primary mt-4 text-xs px-3 py-1.5"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
