import React, { useState } from 'react';
import { Save, Trash2, Edit2, Circle, Clock } from 'lucide-react';
import { formatValue } from '../lib/utils';
import { cn } from '../lib/utils';
import { ActivityRecord, Entity } from '../types';
import { useConfirm } from '../context/ConfirmContext';

export function EntriesRow({
  record,
  entity,
  updateRecord,
  deleteRecord,
  onViewEntity,
  onTotalUpdate,
  onLeave,
  canManageImpact,
  isTotalActionPending,
  onNotify,
}: {
  record: ActivityRecord;
  entity: Entity;
  updateRecord: (e: ActivityRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  onViewEntity: (id: string) => void;
  onTotalUpdate: (record: ActivityRecord) => void;
  onLeave: (record: ActivityRecord) => void;
  canManageImpact: boolean;
  isTotalActionPending: boolean;
  onNotify: (input: { type: 'success' | 'error' | 'info'; message: string }) => void;
}) {
  const { confirm } = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [initialValue, setInitialValue] = useState(record.unit_amount.toString());
  const [total, setTotal] = useState(record.unit_amount.toString());

  const handleSave = async () => {
    const parsedActivityRecordVal = parseFloat(initialValue);
    const parsedTotal = parseFloat(total);
    if (!Number.isFinite(parsedActivityRecordVal) || parsedActivityRecordVal < 10) {
      onNotify({ type: 'error', message: 'ActivityRecord value must be at least 10.' });
      return;
    }
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      onNotify({ type: 'error', message: 'Total must be a valid non-negative number.' });
      return;
    }
    await updateRecord({
      ...record,
      unit_amount: parsedTotal,
    });
    setIsEditing(false);
  };

  const normalizeValueInput = (value: string, setValue: (next: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    setValue(parsed.toFixed(2));
  };



  const handleRemoveActivityRecord = async () => {
    if (isDeleting) return;
    const ok = await confirm({
      title: 'Remove entry?',
      message: 'Remove this record from the activity? This cannot be undone.',
      danger: true,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      setIsDeleting(true);
      await deleteRecord(record.id);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    const editDelta = (parseFloat(total) || 0) - (parseFloat(initialValue) || 0);

    return (
      <tr className="bg-stone-50 dark:bg-stone-800">
        <td className="px-6 py-3 font-medium text-stone-900 dark:text-stone-100">{entity.name}</td>
        <td className="px-6 py-3 text-right">
          <input
            type="number"
            step="0.01"
            min="10"
            className="w-24 p-1 border border-stone-300 dark:border-stone-600 rounded text-right bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100"
            value={initialValue}
            onChange={e => setInitialValue(e.target.value)}
            onBlur={() => normalizeValueInput(initialValue, setInitialValue)}
          />
        </td>
        <td className="px-6 py-3 text-right">
          <input
            type="number"
            className="w-24 p-1 border border-stone-300 dark:border-stone-600 rounded text-right bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100"
            value={total}
            onChange={e => setTotal(e.target.value)}
          />
        </td>
        <td className="px-6 py-3 text-right font-mono text-stone-400">
          <span
            className={cn(
              'font-medium',
              editDelta > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : editDelta < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-stone-400',
            )}
          >
            {editDelta > 0 ? '+' : ''}
            {formatValue(editDelta)}
          </span>
        </td>
        <td className="px-6 py-3 text-right flex justify-end gap-2">
          <button onClick={() => { void handleSave(); }} className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300">
            <Save size={18} />
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors group">
      <td
        className="px-6 py-3 font-medium text-stone-900 dark:text-stone-100 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        onClick={() => onViewEntity(entity.id)}
      >
        {entity?.name || 'Unknown'}
        {record.left_at && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            Left {new Date(record.left_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
        {entity?.tags && entity.tags.length > 0 && (
          <div className="flex gap-1 mt-1">
            {entity.tags.slice(0, 2).map((tag: string) => (
              <span key={tag} className="text-[10px] bg-stone-100 dark:bg-stone-700 px-1 rounded text-stone-500 dark:text-stone-400">
                {tag}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-6 py-3 text-right font-mono text-stone-600 dark:text-stone-300">{formatValue(record.unit_amount)}</td>
      <td className="px-6 py-3 text-right font-mono text-stone-600 dark:text-stone-300">{formatValue(record.unit_amount)}</td>
      <td
        className={cn(
          'px-6 py-3 text-right font-mono font-medium',
          (record.direction === 'increase' ? record.unit_amount : -record.unit_amount) > 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : (record.direction === 'increase' ? record.unit_amount : -record.unit_amount) < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-stone-400',
        )}
      >
        {(record.direction === 'increase' ? record.unit_amount : -record.unit_amount) > 0 ? '+' : ''}
        {formatValue(record.direction === 'increase' ? record.unit_amount : -record.unit_amount)}
      </td>
      <td className="px-6 py-3 text-right">
        <div className="toolbar-surface justify-end">

          {canManageImpact && (
            <>
              <button
                onClick={() => onTotalUpdate(record)}
                disabled={isTotalActionPending}
                aria-label="Update total"
                className="action-pill action-pill-neutral action-pill-sm"
                title="Update Total"
              >
                <Circle size={14} />
                <span className="hidden sm:inline">Total</span>
              </button>
              {!record.left_at && (
                <button
                  onClick={() => onLeave(record)}
                  disabled={isTotalActionPending}
                  aria-label="Mark inactive"
                  className="action-pill action-pill-danger action-pill-sm"
                  title="Mark inactive"
                >
                  <Clock size={14} />
                  <span className="hidden sm:inline">Inactive</span>
                </button>
              )}
              <button onClick={() => setIsEditing(true)} aria-label="Edit entry" className="action-pill action-pill-neutral action-pill-sm" title="Edit entry">
                <Edit2 size={14} />
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                onClick={() => { void handleRemoveActivityRecord(); }}
                disabled={isDeleting}
                aria-label="Remove record"
                className="action-pill action-pill-danger action-pill-sm disabled:opacity-60"
              >
                <Trash2 size={14} />
                <span className="hidden sm:inline">{isDeleting ? 'Removing…' : 'Remove'}</span>
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
