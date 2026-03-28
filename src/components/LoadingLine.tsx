import React from 'react';
import { cn } from '../lib/utils';

type LoadingLineProps = {
  label?: string;
  progress?: number;
  className?: string;
  compact?: boolean;
};

export default function LoadingLine({
  label = 'Loading\u2026',
  progress,
  className,
  compact = false,
}: LoadingLineProps) {
  const isDeterminate = typeof progress === 'number';
  const resolvedProgress = isDeterminate ? Math.max(4, Math.min(100, progress ?? 0)) : 0;

  return (
    <div className={cn(compact ? 'space-y-1' : 'space-y-1.5', className)}>
      <div className={cn(
        'w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800',
        compact ? 'h-[3px]' : 'h-[3px]',
      )}>
        {isDeterminate ? (
          <div
            className="h-full rounded-full bg-stone-800 dark:bg-stone-200 transition-[width] duration-200 ease-out"
            style={{ width: `${resolvedProgress}%` }}
          />
        ) : (
          <div className="overlay-progress-bar" />
        )}
      </div>
      <div className="text-[11px] text-stone-500 dark:text-stone-400">
        {label}{isDeterminate ? ` ${Math.round(resolvedProgress)}%` : ''}
      </div>
    </div>
  );
}
