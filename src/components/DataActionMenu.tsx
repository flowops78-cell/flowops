import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';

type DataActionMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  destructive?: boolean;
};

export default function DataActionMenu({
  items,
  label = 'Actions',
  className,
  variant = 'default',
}: {
  items: DataActionMenuItem[];
  label?: string;
  className?: string;
  /** Compact ⋯ trigger; menu is portaled so it is not clipped by overflow-hidden ancestors. */
  variant?: 'default' | 'icon';
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number; minWidth: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuId = React.useId();

  const updateMenuPosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const minWidth = Math.max(200, r.width);
    // Viewport coords — menu uses position: fixed
    setMenuPos({
      top: r.bottom + 6,
      left: r.right - minWidth,
      minWidth,
    });
  }, []);

  const closeMenu = React.useCallback(() => {
    setIsOpen(false);
    setMenuPos(null);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (containerRef.current?.contains(t)) return;
      const menuEl = document.getElementById(`${menuId}-menu`);
      if (menuEl?.contains(t)) return;
      closeMenu();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, closeMenu, menuId]);

  React.useLayoutEffect(() => {
    if (!isOpen || variant !== 'icon') return;
    updateMenuPosition();
    const onScroll = () => updateMenuPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [isOpen, variant, updateMenuPosition]);

  const menuContent = isOpen ? (
    <div
      id={`${menuId}-menu`}
      role="menu"
      aria-labelledby={`${menuId}-trigger`}
      style={
        variant === 'icon' && menuPos
          ? {
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              minWidth: menuPos.minWidth,
              zIndex: 80,
            }
          : undefined
      }
      className={cn(
        'rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-lg p-1.5 animate-in fade-in slide-in-from-top-2',
        variant === 'icon' && menuPos ? '' : 'absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-[200px]',
      )}
    >
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          onClick={() => {
            if (item.disabled) return;
            item.onClick();
            setIsOpen(false);
            window.setTimeout(() => triggerRef.current?.focus(), 0);
          }}
          disabled={item.disabled}
          className={cn(
            'w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2.5 transition-colors',
            item.destructive
              ? 'text-red-600 dark:text-red-400'
              : 'text-stone-700 dark:text-stone-200',
          )}
        >
          {item.icon && (
            <span className={cn('shrink-0', item.destructive ? 'text-red-500' : 'text-stone-400 dark:text-stone-500')}>
              {item.icon}
            </span>
          )}
          {item.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={`${menuId}-trigger`}
        onClick={() => {
          setIsOpen(prev => {
            const next = !prev;
            if (next && variant === 'icon' && triggerRef.current) {
              const el = triggerRef.current;
              const r = el.getBoundingClientRect();
              const w = Math.max(200, r.width);
              setMenuPos({
                top: r.bottom + 6,
                left: r.right - w,
                minWidth: w,
              });
            }
            if (!next) setMenuPos(null);
            return next;
          });
        }}
        className={cn(
          variant === 'icon'
            ? 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-800 dark:hover:text-stone-100 transition-colors'
            : 'inline-flex items-center gap-1.5 rounded-md border border-stone-300 dark:border-stone-700 bg-white/85 dark:bg-stone-900/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-sm transition-colors',
        )}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? `${menuId}-menu` : undefined}
        aria-label={variant === 'icon' ? (label || 'More actions') : `${label} menu`}
      >
        {variant === 'icon' ? <MoreHorizontal size={18} strokeWidth={2} aria-hidden /> : (
          <>
            {label}
            <ChevronDown size={14} className={cn('transition-transform opacity-50', isOpen && 'rotate-180')} />
          </>
        )}
      </button>

      {variant === 'icon' && menuContent && typeof document !== 'undefined'
        ? createPortal(menuContent, document.body)
        : menuContent}
    </div>
  );
}
