import React from 'react';
import { X } from 'lucide-react';
import { Entity } from '../types';
import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import type { EntityStatEntry } from '../hooks/useEntityStats';

const getEntityDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed Entity';
};

export interface EntityQuickOverlayProps {
  entity: Entity;
  stats: EntityStatEntry;
  canManageImpact: boolean;
  canActivityRecordDeferred: boolean;
  onClose: () => void;
  onSend: () => void;
  onReceive: () => void;
  onAdjust: () => void;
  onAdd: () => void;
}

export default function EntityQuickOverlay({
  entity,
  stats,
  canManageImpact,
  canActivityRecordDeferred,
  onClose,
  onSend,
  onReceive,
  onAdjust,
  onAdd,
}: EntityQuickOverlayProps) {
  return (
    <div className="fixed inset-0 z-40 bg-stone-950/45 backdrop-blur-sm p-4 animate-in fade-in" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center">
        <div
          className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-stone-900 animate-in zoom-in-95"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-stone-900 dark:text-stone-100">
                {getEntityDisplayName(entity.name)}
              </p>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                {stats.activitys} {stats.activitys === 1 ? 'activity' : 'activities'}
                {stats.lastActive ? ` · ${formatDate(stats.lastActive)}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              aria-label="Close entity quick actions"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 rounded-2xl bg-stone-50 px-4 py-5 text-center dark:bg-stone-800/70">
            <p className={cn(
              'font-mono text-3xl font-semibold tabular-nums',
              stats.net > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : stats.net < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-stone-500 dark:text-stone-300'
            )}>
              {formatValue(stats.net)}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {canManageImpact && (
              <button type="button" onClick={onSend} className="action-btn-secondary justify-center py-2 text-sm">
                Send
              </button>
            )}
            {canActivityRecordDeferred && (
              <button type="button" onClick={onReceive} className="action-btn-secondary justify-center py-2 text-sm">
                Receive
              </button>
            )}
            {canManageImpact && (
              <button type="button" onClick={onAdjust} className="action-btn-secondary justify-center py-2 text-sm">
                Adjust
              </button>
            )}
            {canActivityRecordDeferred && (
              <button type="button" onClick={onAdd} className="action-btn-primary justify-center py-2 text-sm">
                Add
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
