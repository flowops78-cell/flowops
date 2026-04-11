import { useEffect } from 'react';
import { ActivityRecord } from '../types';

export interface ActivityKeyboardShortcutsOptions {
  /** When a total-record modal is open, shortcuts are suppressed. */
  totalRecord: ActivityRecord | null;
  /** Current activity status (used for Shift+Enter completion shortcut). */
  activityStatus: string | undefined;
  /** Whether the viewport is mobile-sized (telemetry toggle is disabled on mobile). */
  isMobileViewport: boolean;
  /** Scroll to the add-entity section and focus the entity input. */
  focusAddEntity: () => void;
  /** Scroll to the add-record section and focus the record input. */
  focusActivityRecord: () => void;
  /** Toggle the telemetry sidebar. */
  toggleTelemetry: () => void;
  /** Transition the activity to the given status. */
  handleActivityTransition: (nextStatus: 'active' | 'completed' | 'archived') => Promise<void>;
}

export interface OverlayEscapeOptions {
  isAddOptionsOpen: boolean;
  isAdvancedOverlayOpen: boolean;
  isTotalActionPending: boolean;
  isAddingEntity: boolean;
  isUpdatingWorkforce: boolean;
  isActivityTransitioning: boolean;
  setIsAddOptionsOpen: (open: boolean) => void;
  setIsAdvancedOverlayOpen: (open: boolean) => void;
}

/**
 * Registers global keyboard shortcuts for the ActivityDetail page.
 *
 * Shortcuts (when not typing in an input):
 * - `u` — focus add-entity field
 * - `e` — focus record-value field
 * - `o` — toggle telemetry sidebar (desktop only)
 * - `Shift+Enter` — complete the activity (if active)
 */
export function useActivityKeyboardShortcuts({
  totalRecord,
  activityStatus,
  isMobileViewport,
  focusAddEntity,
  focusActivityRecord,
  toggleTelemetry,
  handleActivityTransition,
}: ActivityKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const normalizedKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);

      if (isTypingTarget || event.metaKey || event.ctrlKey || event.altKey) return;
      if (totalRecord) return;

      if (normalizedKey === 'u') {
        event.preventDefault();
        focusAddEntity();
        return;
      }

      if (normalizedKey === 'e') {
        event.preventDefault();
        focusActivityRecord();
        return;
      }

      if (normalizedKey === 'o' && !isMobileViewport) {
        event.preventDefault();
        toggleTelemetry();
        return;
      }

      if (normalizedKey === 'enter' && event.shiftKey && activityStatus === 'active') {
        event.preventDefault();
        void handleActivityTransition('completed');
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [totalRecord, activityStatus, isMobileViewport, focusAddEntity, focusActivityRecord, toggleTelemetry, handleActivityTransition]);
}

/**
 * Handles Escape key presses to close overlay panels in priority order.
 */
export function useOverlayEscape({
  isAddOptionsOpen,
  isAdvancedOverlayOpen,
  isTotalActionPending,
  isAddingEntity,
  isUpdatingWorkforce,
  isActivityTransitioning,
  setIsAddOptionsOpen,
  setIsAdvancedOverlayOpen,
}: OverlayEscapeOptions): void {
  useEffect(() => {
    const handleOverlayEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isTotalActionPending || isAddingEntity || isUpdatingWorkforce || isActivityTransitioning) return;

      if (isAddOptionsOpen) {
        setIsAddOptionsOpen(false);
        return;
      }

      if (isAdvancedOverlayOpen) {
        setIsAdvancedOverlayOpen(false);
      }
    };

    window.addEventListener('keydown', handleOverlayEscape);
    return () => window.removeEventListener('keydown', handleOverlayEscape);
  }, [isAddOptionsOpen, isAdvancedOverlayOpen, isTotalActionPending, isAddingEntity, isUpdatingWorkforce, isActivityTransitioning, setIsAddOptionsOpen, setIsAdvancedOverlayOpen]);
}
