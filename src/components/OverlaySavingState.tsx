/**
 * OverlaySavingState
 *
 * Shared saving / success / error UI used inside every "Add" overlay card.
 * Import this and render it instead of inlining the spinner + bar in each page.
 *
 * Usage:
 *   <OverlaySavingState state="saving" label="Adding entity…" />
 *   <OverlaySavingState state="success" label="Entity added" />
 *   <OverlaySavingState state="error" message="Couldn't add entity." />
 */

import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

type OverlaySavingStateProps =
  | { state: 'saving'; label?: string }
  | { state: 'success'; label?: string }
  | { state: 'error'; message?: string };

export default function OverlaySavingState(props: OverlaySavingStateProps) {
  if (props.state === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <Loader2 size={28} className="animate-spin text-stone-400" />
        <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
          {props.label ?? 'Saving…'}
        </p>
        {/* Indeterminate bar — no fake percentages */}
        <div className="w-full max-w-[200px] h-[3px] rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
          <div className="overlay-progress-bar" />
        </div>
        <p className="text-xs text-stone-400">Please wait</p>
      </div>
    );
  }

  if (props.state === 'success') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8">
        <CheckCircle2 size={32} className="text-emerald-500 animate-in zoom-in-50 duration-300" />
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          {props.label ?? 'Done'}
        </p>
      </div>
    );
  }

  // 'error' — rendered inline by the parent as a banner; nothing to show here
  return null;
}
