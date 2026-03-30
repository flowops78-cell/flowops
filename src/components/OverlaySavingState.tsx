/**
 * OverlaySavingState
 *
 * Shared saving / success / error UI used inside every "Add" overlay card.
 *
 * Use `fillParent` when the overlay sits above a form that stays in the layout
 * (e.g. visibility:hidden) or when the card would otherwise collapse — the state
 * UI then covers the full card and centers vertically.
 */

import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

type OverlaySavingStateProps =
  | { state: 'saving'; label?: string; compact?: boolean; fillParent?: boolean }
  | { state: 'success'; label?: string; compact?: boolean; fillParent?: boolean }
  | { state: 'error'; message?: string };

function SavingBody({
  compact,
  label,
}: {
  compact?: boolean;
  label?: string;
}) {
  const c = compact;
  return (
    <div
      className={
        c
          ? 'flex flex-col items-center justify-center gap-2.5 py-4'
          : 'flex flex-col items-center justify-center gap-4 py-6'
      }
    >
      <Loader2 size={c ? 26 : 32} className="animate-spin text-stone-500 dark:text-stone-400" aria-hidden />
      <p className="text-center text-sm font-medium text-stone-700 dark:text-stone-300">
        {label ?? 'Saving…'}
      </p>
      <div
        className={
          c
            ? 'h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700'
            : 'h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700'
        }
      >
        <div className="overlay-progress-bar" />
      </div>
      <p className="text-center text-xs text-stone-500 dark:text-stone-400">Please wait</p>
    </div>
  );
}

function SuccessBody({ compact, label }: { compact?: boolean; label?: string }) {
  const c = compact;
  return (
    <div
      className={
        c
          ? 'flex flex-col items-center justify-center gap-2 py-4'
          : 'flex flex-col items-center justify-center gap-3 py-6'
      }
    >
      <CheckCircle2
        size={c ? 30 : 36}
        className="text-emerald-500 animate-in zoom-in-50 duration-300"
        aria-hidden
      />
      <p className="text-center text-sm font-semibold text-stone-900 dark:text-stone-100">
        {label ?? 'Done'}
      </p>
    </div>
  );
}

export default function OverlaySavingState(props: OverlaySavingStateProps) {
  if (props.state === 'error') {
    return null;
  }

  const { fillParent } = props;

  const wrap = (node: React.ReactNode) => {
    if (!fillParent) return node;
    return (
      <div
        className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto rounded-[inherit] bg-white/96 p-6 backdrop-blur-sm dark:bg-stone-950/96"
        role="status"
        aria-live="polite"
        aria-busy={props.state === 'saving'}
      >
        {node}
      </div>
    );
  };

  if (props.state === 'saving') {
    return wrap(<SavingBody compact={props.compact} label={props.label} />);
  }

  return wrap(<SuccessBody compact={props.compact} label={props.label} />);
}
