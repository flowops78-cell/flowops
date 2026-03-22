import React from 'react';
import { cn } from '../lib/utils';

type LoadingLineProps = {
  label?: string;
  progress?: number;
  className?: string;
  compact?: boolean;
};

export default function LoadingLine({
  label = 'Loading…',
  progress,
  className,
  compact = false,
}: LoadingLineProps) {
  const [animatedProgress, setAnimatedProgress] = React.useState(10);
  const isDeterminate = typeof progress === 'number';

  React.useEffect(() => {
    if (isDeterminate) return;

    const timer = window.setInterval(() => {
      setAnimatedProgress(prev => {
        const next = prev + 7;
        return next > 92 ? 10 : next;
      });
    }, 130);

    return () => window.clearInterval(timer);
  }, [isDeterminate]);

  const resolvedProgress = isDeterminate
    ? Math.max(4, Math.min(100, progress ?? 0))
    : animatedProgress;

  return (
    <div className={cn(compact ? 'space-y-1' : 'space-y-1.5', className)}>
      <div className={cn(
        'w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800',
        compact ? 'h-1' : 'h-1.5',
      )}>
        <div
          className={cn(
            'h-full rounded-full bg-emerald-500 transition-[width] duration-200 ease-out',
            !isDeterminate && 'animate-pulse',
          )}
          style={{ width: `${resolvedProgress}%` }}
        />
      </div>
      <div className="text-[11px] text-stone-500 dark:text-stone-400">
        {label}{isDeterminate ? ` ${Math.round(resolvedProgress)}%` : ''}
      </div>
    </div>
  );
}
