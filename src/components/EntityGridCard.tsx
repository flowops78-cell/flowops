import React, { useMemo } from 'react';
import { TrendingUp, Calendar, Award, ArrowRightLeft, Edit2, Clock, Tag, Eye, Trash2, Zap } from 'lucide-react';
import { Entity } from '../types';
import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import DataActionMenu from './DataActionMenu';
import type { EntityStatEntry } from '../hooks/useEntityStats';

const getEntityDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed Entity';
};

export interface EntityGridCardProps {
  entity: Entity;
  stats: EntityStatEntry;
  onOpenOverlay: () => void;
  onOpenProfile: () => void;
  onOpenSnapshot: () => void;
  canManageImpact: boolean;
  canActivityRecordDeferred: boolean;
  activeAction: 'send' | 'adjust' | 'pending' | null;
  onAction: (action: 'send' | 'adjust' | 'pending') => void;
  onDelete: () => void;
}

export default function EntityGridCard({
  entity,
  stats,
  onOpenOverlay,
  onOpenProfile,
  onOpenSnapshot,
  canManageImpact,
  canActivityRecordDeferred,
  activeAction,
  onAction,
  onDelete,
}: EntityGridCardProps) {
  const entityMoreMenuItems = useMemo(
    () => {
      const items: {
        key: string;
        label: string;
        onClick: () => void;
        icon?: React.ReactNode;
        destructive?: boolean;
      }[] = [
        { key: 'quick', label: 'Quick', onClick: onOpenOverlay, icon: <Zap size={14} /> },
        { key: 'snapshot', label: 'Snapshot', onClick: onOpenSnapshot, icon: <Eye size={14} /> },
        { key: 'open', label: 'Open', onClick: onOpenProfile, icon: <Tag size={14} /> },
      ];
      if (canManageImpact) {
        items.push({
          key: 'delete',
          label: 'Delete',
          onClick: onDelete,
          icon: <Trash2 size={14} />,
          destructive: true,
        });
      }
      return items;
    },
    [canManageImpact, onDelete, onOpenOverlay, onOpenProfile, onOpenSnapshot],
  );

  return (
    <div className={cn(
      'section-card-hover flex min-w-0 flex-col overflow-hidden',
      activeAction ? 'rounded-b-none border-b-0' : '',
    )}>
      {/* Header: name + net */}
      <div className="cursor-pointer p-5" onClick={onOpenOverlay}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-stone-900 dark:text-stone-100 truncate" title={getEntityDisplayName(entity.name)}>{getEntityDisplayName(entity.name)}</p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {stats.activitys > 0 ? `${stats.activitys} · ` : ''}{stats.lastActive ? formatDate(stats.lastActive) : 'No activity'}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 font-mono text-lg font-semibold tabular-nums',
              stats.net > 0 ? 'text-emerald-600 dark:text-emerald-400' : stats.net < 0 ? 'text-red-600 dark:text-red-400' : 'text-stone-400 dark:text-stone-500',
            )}
            title="Net balance"
          >
            {formatValue(stats.net)}
          </span>
        </div>

        {/* Icon stat row */}
        <div className="mt-3 flex items-center gap-3 text-xs text-stone-400 dark:text-stone-500">
          {stats.totalInflow > 0 && (
            <span className="flex items-center gap-1">
              <TrendingUp size={11} className="text-emerald-500" />
              {formatValue(stats.totalInflow)}
            </span>
          )}
          {stats.activitys > 0 && (
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {stats.activitys}
            </span>
          )}
          {stats.surpluses > 0 && (
            <span className="flex items-center gap-1">
              <Award size={11} className="text-amber-500" />
              {stats.surpluses}
            </span>
          )}
        </div>
      </div>

      {/* Action bar: primary full-width, secondary row + overflow menu (same handlers as before) */}
      <div className="flex min-w-0 flex-col gap-2 px-4 pb-3 pt-0" onClick={e => e.stopPropagation()}>
        {canManageImpact && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onAction('send');
            }}
            className={cn(
              'flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
              activeAction === 'send'
                ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-600 dark:bg-amber-900/25 dark:text-amber-300'
                : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-amber-300 hover:bg-amber-50/80 hover:text-amber-800 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-200 dark:hover:border-amber-700 dark:hover:bg-amber-950/30',
            )}
          >
            <ArrowRightLeft size={14} className="shrink-0" />
            Send
          </button>
        )}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {canManageImpact && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onAction('adjust');
                }}
                className={cn(
                  'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  activeAction === 'adjust'
                    ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300'
                    : 'border-stone-200 text-stone-600 hover:border-sky-300 hover:text-sky-700 dark:border-stone-600 dark:text-stone-300 dark:hover:text-sky-400',
                )}
              >
                <Edit2 size={12} className="shrink-0" />
                Adjust
              </button>
            )}
            {canActivityRecordDeferred && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onAction('pending');
                }}
                className={cn(
                  'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  activeAction === 'pending'
                    ? 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
                    : 'border-stone-200 text-stone-600 hover:border-purple-300 hover:text-purple-700 dark:border-stone-600 dark:text-stone-300 dark:hover:text-purple-400',
                )}
              >
                <Clock size={12} className="shrink-0" />
                Pending
              </button>
            )}
          </div>
          <DataActionMenu variant="icon" label="More entity actions" items={entityMoreMenuItems} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
