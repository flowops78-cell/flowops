import React from 'react';
import { cn } from '../lib/utils';
import { Copy, Globe } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

interface IdentityBadgeProps {
  id: string;
  name?: string;
  tag?: string;
  slug?: string;
  type: 'cluster' | 'org';
  size?: 'sm' | 'md' | 'lg';
  showUuid?: boolean;
  className?: string;
}

const IdentityBadge: React.FC<IdentityBadgeProps> = ({
  id,
  name,
  tag,
  slug,
  type,
  size = 'md',
  showUuid = false,
  className
}) => {
  const { notify } = useNotification();
  
  const shortId = id ? `${type === 'cluster' ? 'clu' : 'org'}_${id.slice(0, 6)}` : '';
  const displayName = name || tag || slug || (id ? (type === 'cluster' ? 'Unnamed Cluster' : 'Unnamed Org') : '');
  
  if (!id && !name && !tag && !slug) return null;
  
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    notify({ type: 'success', message: `${label} copied to clipboard.` });
  };

  return (
    <div className={cn("inline-flex flex-col gap-0.5 min-w-0", className)}>
      <div className="flex items-center gap-2 min-w-0">
        <span 
          className={cn(
            "font-semibold truncate",
            size === 'sm' ? "text-[11px]" : size === 'md' ? "text-xs" : "text-sm",
            "text-stone-900 dark:text-stone-100"
          )}
          title={displayName}
        >
          {displayName}
        </span>
        
        {tag && (
          <span className={cn(
            "px-1.5 py-0.5 rounded-md font-bold uppercase tracking-tighter shrink-0",
            size === 'sm' ? "text-[8px]" : "text-[9px]",
            type === 'cluster' 
              ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30"
              : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30"
          )}>
            {tag}
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-1.5 group flex-wrap">
        {shortId && (
          <span 
            className={cn(
              "font-mono cursor-help select-all",
              size === 'sm' ? "text-[8px]" : "text-[9px]",
              "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-400 transition-colors"
            )}
            title={`Full UUID: ${id}`}
          >
            {shortId}
          </span>
        )}
        
        {shortId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(id, 'UUID');
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-stone-50 dark:hover:bg-stone-800 rounded text-stone-400 hover:text-stone-600"
            title="Copy UUID"
          >
            <Copy size={size === 'sm' ? 7 : 8} />
          </button>
        )}

        {slug && (
          <span className={cn(
            "italic opacity-40 font-medium",
            size === 'sm' ? "text-[8px]" : "text-[9px]",
            "text-stone-500 dark:text-stone-400"
          )}>
            · {slug}
          </span>
        )}
      </div>
      
      {showUuid && (
        <div className="mt-1 flex items-center gap-2 p-1.5 rounded bg-stone-50 dark:bg-stone-900/50 border border-stone-100 dark:border-stone-800 text-[9px] font-mono text-stone-500">
          <span className="truncate flex-1">{id}</span>
          <button 
            onClick={() => copyToClipboard(id, 'UUID')}
            className="text-stone-400 hover:text-blue-600"
          >
            <Copy size={10} />
          </button>
        </div>
      )}
    </div>
  );
};

export default IdentityBadge;
