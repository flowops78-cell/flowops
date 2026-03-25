import React from 'react';
import { cn } from '../lib/utils';

interface ShortcutIconButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  showLabel?: boolean;
  variant?: 'primary' | 'secondary';
  className?: string;
}

export default function ShortcutIconButton({
  icon,
  label,
  onClick,
  showLabel = true,
  variant = 'secondary',
  className
}: ShortcutIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "group relative flex flex-row items-center justify-center gap-2.5 rounded-xl transition-all duration-200",
        "min-h-[44px] w-full px-3 py-2", // More compact and dense
        variant === 'primary' 
          ? "bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white shadow-sm"
          : "bg-white border border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-400 dark:hover:border-stone-700 dark:hover:bg-stone-800/50",
        "focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2 dark:focus:ring-offset-stone-950",
        "interactive-3d", // Match app aesthetic
        className
      )}
    >
      <div className={cn(
        "flex items-center justify-center transition-transform duration-200 group-hover:scale-110",
        variant === 'primary' ? "text-white dark:text-stone-900" : "text-amber-500 dark:text-amber-400"
      )}>
        {React.cloneElement(icon as React.ReactElement<any>, { size: 18, strokeWidth: 2.5 })}
      </div>
      
      {showLabel && (
        <span className={cn(
          "text-[11px] font-semibold tracking-tight whitespace-nowrap",
          variant === 'primary' ? "text-white dark:text-stone-900" : "text-stone-700 dark:text-stone-300"
        )}>
          {label}
        </span>
      )}
    </button>
  );
}
