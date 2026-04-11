import React from 'react';
import { cn } from '../lib/utils';
import { formatCompactValue, formatValue } from '../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelPalette {
  readonly badgeClass: string;
  readonly chartColor: string;
}

export interface ChannelVisual {
  badgeClass: string;
  chartColor: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Palette constant
// ---------------------------------------------------------------------------

export const CHANNEL_PALETTES: readonly ChannelPalette[] = [
  { badgeClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300', chartColor: '#10b981' },
  { badgeClass: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300', chartColor: '#0ea5e9' },
  { badgeClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300', chartColor: '#f59e0b' },
  { badgeClass: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/40 dark:text-fuchsia-300', chartColor: '#d946ef' },
  { badgeClass: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300', chartColor: '#f43f5e' },
  { badgeClass: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300', chartColor: '#8b5cf6' },
  { badgeClass: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300', chartColor: '#06b6d4' },
  { badgeClass: 'bg-lime-50 text-lime-600 dark:bg-lime-950/40 dark:text-lime-300', chartColor: '#84cc16' },
] as const;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Deterministic hash of a channel key string to a positive integer. */
export function hashChannel(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

/** Normalize a channel key for consistent comparisons / hashing. */
export function normalizeChannelKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Format a raw channel string into a human-friendly label. */
export function formatChannelLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return 'Other';
  if (trimmed === 'channel_account') return 'Channel';
  if (trimmed === 'value') return 'Value';
  return trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

/** Alias: format a base method key into a label. */
export function baseMethodLabel(base: string): string {
  return formatChannelLabel(base);
}

/** Split a composite "base::account" method string. */
export function parseMethod(method: string): { base: string; account: string } {
  const [base, ...rest] = method.split('::');
  return {
    base: base || 'other',
    account: rest.join('::').trim(),
  };
}

/** Join a base + account back into a composite method string. */
export function composeMethod(base: string, account: string): string {
  const trimmed = account.trim();
  return trimmed ? `${base}::${trimmed}` : base;
}

/** Human-friendly label for a composite method string. */
export function formatMethodLabel(method: string): string {
  const { base, account } = parseMethod(method);
  const label = baseMethodLabel(base);
  return account ? `${label} \u2022 ${account}` : label;
}

/** Returns the palette + icon metadata for a given channel base key. */
export function getChannelVisual(base: string): ChannelVisual {
  const palette = CHANNEL_PALETTES[hashChannel(normalizeChannelKey(base) || 'other') % CHANNEL_PALETTES.length];
  return {
    badgeClass: palette.badgeClass,
    chartColor: palette.chartColor,
    icon: <ChannelGlyph base={base} />,
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export interface ChannelGlyphProps {
  base: string;
  className?: string;
}

/** SVG glyph whose shape varies deterministically based on the channel key. */
export function ChannelGlyph({ base, className = 'h-4 w-4' }: ChannelGlyphProps) {
  const variant = hashChannel(normalizeChannelKey(base) || 'other') % 6;

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none">
      {variant === 0 && (
        <>
          <circle cx="12" cy="12" r="6" fill="currentColor" opacity="0.18" />
          <circle cx="12" cy="12" r="3.25" fill="currentColor" />
        </>
      )}
      {variant === 1 && (
        <>
          <path d="M12 4 20 12 12 20 4 12 12 4Z" fill="currentColor" opacity="0.18" />
          <path d="M12 7.2 16.8 12 12 16.8 7.2 12 12 7.2Z" fill="currentColor" />
        </>
      )}
      {variant === 2 && (
        <>
          <path d="M12 4 19 18H5L12 4Z" fill="currentColor" opacity="0.18" />
          <path d="M12 8.2 15.7 15H8.3L12 8.2Z" fill="currentColor" />
        </>
      )}
      {variant === 3 && (
        <>
          <rect x="4" y="5" width="6" height="14" rx="2" fill="currentColor" opacity="0.18" />
          <rect x="9" y="8" width="6" height="11" rx="2" fill="currentColor" opacity="0.4" />
          <rect x="14" y="4" width="6" height="15" rx="2" fill="currentColor" />
        </>
      )}
      {variant === 4 && (
        <>
          <path d="M4 15c2.4 0 2.4-6 4.8-6s2.4 6 4.8 6 2.4-6 4.8-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
          <path d="M4 11c2.4 0 2.4 6 4.8 6s2.4-6 4.8-6 2.4 6 4.8 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {variant === 5 && (
        <>
          <rect x="5" y="5" width="14" height="14" rx="4" fill="currentColor" opacity="0.18" />
          <path d="M8 8h8v8H8z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export interface TotalCardProps {
  icon: React.ReactNode;
  label: string;
  amount: number;
  badgeClass: string;
  onClick?: () => void;
}

/** Summary card showing a channel label, icon, and compact monetary value. */
export function TotalCard({ icon, label, amount, badgeClass, onClick }: TotalCardProps) {
  const fullValue = formatValue(amount);
  const compactValue = formatCompactValue(amount);

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      className={cn(
        'group relative px-2.5 py-2 min-w-0 text-left w-full bg-white dark:bg-stone-900',
        onClick ? 'cursor-pointer hover:bg-stone-50/70 dark:hover:bg-stone-900/60' : ''
      )}
      aria-label={`${label} ${fullValue}`}
      title={fullValue}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={cn('p-1.5 rounded-md shrink-0', badgeClass)}>
            {icon}
          </div>
          <p className="kpi-label text-[10px] font-medium text-stone-500 dark:text-stone-400 uppercase tracking-[0.06em] truncate" title={label}>{label}</p>
        </div>
        <p
          className={cn(
            'kpi-metric text-[15px] font-medium font-mono tabular-nums text-right min-w-[88px] shrink-0',
            amount > 0
              ? 'amount-positive'
              : amount < 0
                ? 'amount-negative'
                : 'amount-zero',
          )}
          title={fullValue}
        >
          {compactValue}
        </p>
      </div>
    </div>
  );
}
