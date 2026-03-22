import { ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface ContextBreadcrumbsProps {
  items: string[];
  className?: string;
}

export default function ContextBreadcrumbs({ items, className }: ContextBreadcrumbsProps) {
  // A single breadcrumb duplicates the page title without adding context.
  if (items.length <= 1) return null;

  return (
    <nav aria-label="Current page context" className={cn('flex flex-wrap items-center gap-1 text-xs text-stone-500 dark:text-stone-400', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && <ChevronRight size={12} className="text-stone-400 dark:text-stone-600" />}
            <span className={cn(isLast ? 'text-stone-800 dark:text-stone-100 font-medium' : 'text-stone-500 dark:text-stone-400')}>
              {item}
            </span>
          </span>
        );
      })}
    </nav>
  );
}