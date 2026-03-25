import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

type DataActionMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
};

export default function DataActionMenu({
  items,
  label = 'Actions',
  className,
}: {
  items: DataActionMenuItem[];
  label?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 dark:border-stone-700 bg-white/85 dark:bg-stone-900/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-sm transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {label}
        <ChevronDown size={14} className={cn('transition-transform opacity-50', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-[200px] rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg p-1.5 animate-in fade-in slide-in-from-top-2">
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.disabled) return;
                item.onClick();
                setIsOpen(false);
              }}
              disabled={item.disabled}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors"
            >
              {item.icon && <span className="text-stone-400 dark:text-stone-500">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
