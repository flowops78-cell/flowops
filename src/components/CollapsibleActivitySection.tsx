import { useState, type ReactNode, type Ref, type UIEventHandler } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface CollapsibleActivitySectionProps {
  title: string;
  summary?: string;
  className?: string;
  defaultExpanded?: boolean;
  maxExpandedHeightClass?: string;
  maxCollapsedHeightClass?: string;
  contentClassName?: string;
  contentId?: string;
  contentRef?: Ref<HTMLDivElement>;
  onContentScroll?: UIEventHandler<HTMLDivElement>;
  children: ReactNode;
  extraHeaderContent?: ReactNode;
}

export default function CollapsibleActivitySection({
  title,
  summary,
  className,
  defaultExpanded = false,
  maxExpandedHeightClass = 'max-h-[560px]',
  maxCollapsedHeightClass = 'max-h-[220px]',
  contentClassName,
  contentId,
  contentRef,
  onContentScroll,
  children,
  extraHeaderContent,
}: CollapsibleActivitySectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn("overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80", className)}>
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 bg-stone-50/80 dark:bg-stone-800/60">
        <button
          type="button"
          onClick={() => setIsExpanded(expanded => !expanded)}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100"
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {title}
        </button>
        <div className="flex items-center gap-3 ml-auto">
          {extraHeaderContent}
          {summary ? <span className="text-xs text-stone-500 dark:text-stone-400">{summary}</span> : null}
        </div>
      </div>

      <div
        id={contentId}
        ref={contentRef}
        onScroll={onContentScroll}
        className={cn(
          'overflow-x-auto overflow-y-auto bg-white/90 dark:bg-stone-950/60 transition-[max-height] duration-200',
          isExpanded ? maxExpandedHeightClass : maxCollapsedHeightClass,
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
