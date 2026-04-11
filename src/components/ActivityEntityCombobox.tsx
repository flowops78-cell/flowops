import React, { useState, useEffect, useRef, useMemo, useId } from 'react';
import { Entity } from '../types';
import { cn } from '../lib/utils';

export interface ActivityEntityComboboxProps {
  availableEntities: Entity[];
  selectedUnitId: string;
  quickUnitName: string;
  onInputChange: (value: string) => void;
  onPick: (entity: Entity) => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
}

export default function ActivityEntityCombobox({
  availableEntities,
  selectedUnitId,
  quickUnitName,
  onInputChange,
  onPick,
  disabled,
  inputRef,
  placeholder = 'Entity',
}: ActivityEntityComboboxProps) {
  const baseId = useId();
  const listId = `${baseId}-entity-suggest`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  /** DOM timers are numeric IDs in the browser. */
  const blurTimer = useRef<number | null>(null);

  const displayValue = selectedUnitId
    ? (availableEntities.find(e => e.id === selectedUnitId)?.name ?? '')
    : quickUnitName;

  const q = displayValue.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return availableEntities.slice(0, 45);
    return [...availableEntities]
      .filter(e => (e.name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const an = (a.name || '').toLowerCase();
        const bn = (b.name || '').toLowerCase();
        const ap = an.startsWith(q) ? 0 : 1;
        const bp = bn.startsWith(q) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return an.localeCompare(bn);
      })
      .slice(0, 45);
  }, [availableEntities, q]);

  const cancelClose = () => {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    blurTimer.current = window.setTimeout(() => setOpen(false), 200) as unknown as number;
  };

  useEffect(() => () => cancelClose(), []);

  const showList = open && !disabled && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        role="combobox"
        className="w-full rounded-2xl bg-transparent px-4 py-3 text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100"
        placeholder={placeholder}
        value={displayValue}
        disabled={disabled}
        onChange={e => {
          cancelClose();
          onInputChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => {
          cancelClose();
          setOpen(true);
          setHighlight(0);
        }}
        onBlur={scheduleClose}
        onKeyDown={e => {
          if (!showList) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight(i => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight(i => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && suggestions[highlight]) {
            e.preventDefault();
            onPick(suggestions[highlight]!);
            setOpen(false);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-52 overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
        >
          {suggestions.map((ent, i) => (
            <li key={ent.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={cn(
                  'flex w-full px-3 py-2 text-left text-sm text-stone-900 dark:text-stone-100',
                  i === highlight ? 'bg-stone-100 dark:bg-stone-800' : 'hover:bg-stone-50 dark:hover:bg-stone-800/80',
                )}
                onMouseDown={e => {
                  e.preventDefault();
                  onPick(ent);
                  cancelClose();
                  setOpen(false);
                }}
              >
                {ent.name || 'Unnamed Entity'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
