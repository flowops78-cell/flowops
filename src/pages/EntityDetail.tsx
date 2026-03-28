import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, X, PlusCircle, ChevronDown } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAppRole } from '../context/AppRoleContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import { ActivityRecord } from '../types';
import EntitySnapshot from '../components/EntitySnapshot';
import { useLabels } from '../lib/labels';

type UnitAccountActivityRecordType = 'increment' | 'adjustment' | 'decrement';

const isoToday = () => new Date().toISOString().split('T')[0];

export default function EntityDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const {
    entities,
    updateEntity,
    records,
    activities,
    addChannelRecord,
    addRecord,
    requestAdjustment,
    updateRecord,
    channels,
  } = useData();
  const { canAccessAdminUi, canManageImpact, canAlign } = useAppRole();
  const { tx } = useLabels();
  const isAdmin = canAccessAdminUi;
  const canManageEntityTx = canManageImpact;
  const { notify } = useNotification();
  const { confirm } = useConfirm();

  const unit = useMemo(() => entities.find(item => item.id === id), [entities, id]);

  const [recordType, setRecordType] = useState<UnitAccountActivityRecordType>('increment');
  const [recordAmount, setRecordAmount] = useState('');
  const [recordMethod, setRecordMethod] = useState('');

  const [requestAmount, setRequestAmount] = useState('');

  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [adjustmentPercent, setAdjustmentPercent] = useState('5');
  const [overrideTargetTotal, setOverrideTargetTotal] = useState('');
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [isOverrideExpanded, setIsOverrideExpanded] = useState(false);

  const entityEntries = useMemo(
    () => records.filter(item => item.entity_id === id).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [records, id],
  );

  const entityRequests = useMemo(
    () => records.filter(item => item.entity_id === id && (item.status === 'pending' || item.status === 'deferred')).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [records, id],
  );

  const operatorActions = useMemo(() => {
    const inflowAndAdjustmentOps = entityEntries
      .filter(item => item.direction === 'increase')
      .map(item => ({
        id: `tx-${item.id}`,
        occurredAt: item.created_at || new Date().toISOString(),
        action: 'Inbound recorded',
        amount: item.unit_amount,
      }));

    const resolutionOps = entityEntries
      .filter(item => item.direction === 'decrease')
      .map(item => ({
        id: `req-${item.id}`,
        occurredAt: item.created_at || new Date().toISOString(),
        action: item.status === 'applied' ? 'Outbound applied' : `Outbound ${item.status}`,
        amount: item.unit_amount,
      }));

    return [...inflowAndAdjustmentOps, ...resolutionOps]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 12);
  }, [entityEntries]);

  const performanceDelta = useMemo(
    () => records.filter(item => item.entity_id === id).reduce((sum, item) => sum + (item.direction === 'increase' ? item.unit_amount : -item.unit_amount), 0),
    [records, id],
  );

  const inflowsAndAdjustments = useMemo(
    () => entityEntries.reduce((sum, item) => sum + (item.direction === 'increase' ? item.unit_amount : 0), 0),
    [entityEntries],
  );

  const totalOutflows = useMemo(
    () => entityEntries.reduce((sum, item) => sum + (item.direction === 'decrease' ? item.unit_amount : 0), 0),
    [entityEntries],
  );

  const computedTotal = useMemo(
    () => inflowsAndAdjustments + performanceDelta - totalOutflows,
    [inflowsAndAdjustments, performanceDelta, totalOutflows],
  );

  const operationalWeightRangeTotal = useMemo(() => {
    if (!id || !rangeStart || !rangeEnd || rangeStart > rangeEnd) {
      return { surcharge: 0, activities: 0 };
    }

    const unitActivityIds = new Set(
      records
        .filter(record => record.entity_id === id)
        .map(record => record.activity_id),
    );

    let operationalWeight = 0;
    let activitysCount = 0;
    unitActivityIds.forEach(activityId => {
      const activity = activities.find(item => item.id === activityId);
      if (!activity) return;
      if (activity.date < rangeStart || activity.date > rangeEnd) return;
      activitysCount += 1;
    });

    return { surcharge: 0, activities: activitysCount };
  }, [id, records, activities, rangeStart, rangeEnd]);

  if (!unit) {
    return (
      <div className="page-shell">
        <div className="section-card p-6 space-y-4">
          <p className="text-sm text-stone-500 dark:text-stone-400">Entity not found.</p>
          <button type="button" onClick={() => navigate('/entities')} className="action-btn-secondary">
            <ArrowLeft size={14} />
            Back to Entities
          </button>
        </div>
      </div>
    );
  }

  const handleUpdateEntityTags = async (unitId: string, tags: string[]) => {
    if (!isAdmin) {
      notify({ type: 'error', message: 'Only admin can edit unit tags.' });
      return;
    }
    if (unit.id !== unitId) return;

    try {
      await updateEntity({ ...unit, tags });
      notify({ type: 'success', message: 'Entity tags updated.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to update entity tags.' });
    }
  };

  const handleTransfer = async (targetId: string, amount: number) => {
    if (!unit) return;
    try {
      await addRecord({
        entity_id: unit.id,
        target_entity_id: targetId,
        unit_amount: amount,
        direction: 'transfer',
        status: 'applied',
        notes: `Transfer to ${entities.find(e => e.id === targetId)?.name || targetId}`,
      });
      notify({ type: 'success', message: 'Transfer completed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Transfer failed.' });
    }
  };

  const handleAddManualActivityRecord = async () => {
    if (!canManageEntityTx) {
      notify({ type: 'error', message: 'Only admin or operator can post inputs or adjustments.' });
      return;
    }
    const amount = Number(recordAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify({ type: 'error', message: 'Amount must be greater than 0.' });
      return;
    }

    if (!recordMethod) {
      notify({ type: 'error', message: 'Select a transfer source from Channels.' });
      return;
    }

    await addRecord({
      entity_id: unit.id,
      direction: recordType === 'decrement' ? 'decrease' : 'increase',
      unit_amount: amount,
      status: 'applied',
      channel_label: recordMethod,
      notes: recordType === 'adjustment' ? 'Manual adjustment' : `Manual record - Channel: ${recordMethod}`,
    });

    // Sync with channel ONLY for increments and decrements (not adjustments)
    if (recordType !== 'adjustment') {
      try {
        await addChannelRecord({
          type: recordType === 'increment' ? 'decrement' : 'increment',
          amount,
          method: recordMethod,
          date: isoToday(),
        });
      } catch (error) {
        notify({ type: 'warning', message: 'ActivityRecord posted but channel sync failed. ActivityRecord manually.' });
      }
    }

    setRecordAmount('');
    setRecordMethod('');
    notify({ type: 'success', message: `${recordType === 'adjustment' ? 'Adjustment' : recordType === 'increment' ? 'Increase' : 'Decrease'} posted.` });
  };

  const handleCreateOutputRequest = async () => {
    if (!canManageEntityTx) {
      notify({ type: 'error', message: 'Only admin or operator can log adjustment requests.' });
      return;
    }

    const amount = Number(requestAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify({ type: 'error', message: 'Adjustment request amount must be greater than 0.' });
      return;
    }

    await addRecord({
      entity_id: unit.id,
      unit_amount: amount,
      direction: 'decrease',
      status: 'pending',
      notes: 'Outflow request (pending approval)',
    });
    setRequestAmount('');
    notify({ type: 'success', message: 'Adjustment request submitted for review.' });
  };

  const resolveRequest = async (request: ActivityRecord, nextStatus: 'approved' | 'rejected') => {
    if (!canAlign) {
      notify({ type: 'error', message: 'Only admin can approve or reject requests.' });
      return;
    }
    if (request.status !== 'pending') return;

    const canonicalStatus = nextStatus === 'approved' ? 'applied' : 'voided';
    await updateRecord({ ...request, status: canonicalStatus });

    if (nextStatus === 'approved') {
      try {
        await addChannelRecord({
          type: 'decrement',
          amount: request.unit_amount,
          method: 'value',
          date: isoToday(),
        });
      } catch {
        notify({ type: 'warning', message: 'Request approved, but channel record could not be recorded.' });
      }
    }

    notify({ type: 'success', message: `Request ${nextStatus}.` });
  };

  const handleApplyServiceFeeAdjustment = async () => {
    if (!isAdmin) {
      notify({ type: 'error', message: 'Only admin can apply a service adjustment.' });
      return;
    }
    if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
      notify({ type: 'error', message: 'Date range is invalid.' });
      return;
    }
    const percent = Number(adjustmentPercent);
    if (!Number.isFinite(percent) || percent <= 0) {
      notify({ type: 'error', message: 'Adjustment percent must be greater than 0.' });
      return;
    }

    const adjustmentAmount = (operationalWeightRangeTotal.surcharge || 0) * (percent / 100);
    if (adjustmentAmount <= 0) {
      notify({ type: 'error', message: 'Calculated adjustment is 0 or negative.' });
      return;
    }

    await addRecord({
      entity_id: unit.id,
      direction: 'decrease',
      unit_amount: Number(adjustmentAmount.toFixed(2)),
      status: 'applied',
      notes: 'Service alignment',
    });
    notify({ type: 'success', message: 'Service adjustment posted.' });
  };

  const handleManualOverride = async () => {
    if (!isAdmin) {
      notify({ type: 'error', message: 'Only admin can perform manual override.' });
      return;
    }

    const target = Number(overrideTargetTotal);
    if (!Number.isFinite(target)) {
      notify({ type: 'error', message: 'Target total must be a valid number.' });
      return;
    }

    const delta = Number((target - computedTotal).toFixed(2));
    if (Math.abs(delta) < 0.005) {
      notify({ type: 'info', message: 'Target matches current computed total. No override needed.' });
      return;
    }

    const ok = await confirm({
      title: 'Apply manual override?',
      message: `For ${unit.name || 'this entity'}:\nCurrent: ${formatValue(computedTotal)}\nTarget: ${formatValue(target)}\nDelta: ${delta >= 0 ? '+' : ''}${formatValue(delta)}`,
      confirmLabel: 'Apply',
    });
    if (!ok) return;

    if (delta > 0) {
      await addRecord({
        entity_id: unit.id,
        direction: 'increase',
        unit_amount: Math.abs(delta),
        status: 'applied',
        notes: `Manual override: increase to ${formatValue(target)}`,
      });

      // Sync with channel: override increase = decrement from source
      try {
        await addChannelRecord({
          type: 'decrement',
          amount: Math.abs(delta),
          method: 'override_adjustment',
          date: isoToday(),
        });
      } catch (error) {
        notify({ type: 'warning', message: 'Override recorded but channel sync failed. ActivityRecord manually.' });
      }
    } else {
      await addRecord({
        entity_id: unit.id,
        direction: 'decrease',
        unit_amount: Math.abs(delta),
        status: 'applied',
        notes: `Manual override: decrease to ${formatValue(target)}`,
      });

      // Sync with channel: override decrease = increment to source
      try {
        await addChannelRecord({
          type: 'increment',
          amount: Math.abs(delta),
          method: 'override_adjustment',
          date: isoToday(),
        });
      } catch (error) {
        notify({ type: 'warning', message: 'Override recorded but channel sync failed. ActivityRecord manually.' });
      }
    }

    // recordSystemEvent removed as it is not in the current DataContext

    setOverrideTargetTotal('');
    notify({ type: 'warning', message: 'Manual override applied and logged.' });
  };

  const transferAccounts = useMemo(() => {
    return channels.filter(c => c.is_active || c.status === 'active');
  }, [channels]);

  return (
    <div className="page-shell space-y-6">
      <div className="section-card p-5 lg:p-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-stone-500 dark:text-stone-400">Entity Detail</p>
          <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">{unit.name || 'Unnamed Entity'}</h2>
          {unit.tags && unit.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unit.tags.map(tag => (
                <span key={tag} className="inline-flex items-center rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-600 dark:text-stone-300">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setIsSnapshotOpen(true)} className="action-btn-secondary">
            Entity Snapshot
          </button>
          <button type="button" onClick={() => navigate('/entities')} className="action-btn-secondary">
            <ArrowLeft size={14} />
            Back to Entities
          </button>
        </div>
      </div>

      <div className="section-card p-5 lg:p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-stone-500 dark:text-stone-400">Inputs + Adjustments</p>
          <p className="text-lg font-mono text-stone-900 dark:text-stone-100">{formatValue(inflowsAndAdjustments)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500 dark:text-stone-400">Operational Delta</p>
          <p className={cn('text-lg font-mono', performanceDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {formatValue(performanceDelta)}
          </p>
        </div>
        <div>
          <p className="text-xs text-stone-500 dark:text-stone-400">{tx('Decreases')}</p>
          <p className="text-lg font-mono text-red-600 dark:text-red-400">{formatValue(totalOutflows)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500 dark:text-stone-400">Computed Total</p>
          <p className={cn('text-lg font-mono', computedTotal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {formatValue(computedTotal)}
          </p>
        </div>
        <div className="md:col-span-4">
          <p className="text-xs text-stone-500 dark:text-stone-400">Formula</p>
          <p className="text-sm text-stone-700 dark:text-stone-200">Inputs + Adjustments + Operational Delta - Outputs</p>
          {!isAdmin && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">This operational flow is admin-controlled. Non-admin roles are read-only on this page.</p>
          )}
        </div>
      </div>

      {canManageEntityTx && (
        <div className="section-card p-5 lg:p-6 space-y-4">
          <h3 className="text-base font-medium text-stone-900 dark:text-stone-100">{tx('Post ActivityRecord')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select className="control-input" value={recordType} onChange={e => setRecordType(e.target.value as UnitAccountActivityRecordType)}>
              <option value="increment">{tx('Increase')}</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <input className="control-input" type="number" min="0.01" step="0.01" placeholder="Amount" value={recordAmount} onChange={e => setRecordAmount(e.target.value)} />
            <button type="button" onClick={() => { void handleAddManualActivityRecord(); }} className="action-btn-primary">
              <PlusCircle size={14} />
              Post
            </button>
          </div>
          <div>
            <label className="block text-xs text-stone-500 dark:text-stone-400 mb-1">TransferAmount Source (links to Channels)</label>
            <select
              className="control-input max-w-sm"
              value={recordMethod}
              onChange={e => setRecordMethod(e.target.value)}
              required
            >
              <option value="">Select transfer source...</option>
              {transferAccounts.filter(a => a.is_active).map(a => (
                <option key={a.id} value={`${a.category}::${a.name}`}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}



      {isAdmin && (
        <div className="section-card p-5 lg:p-6 space-y-4">
          <h3 className="text-base font-medium text-stone-900 dark:text-stone-100">Service Adjustment by Date Range</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input className="control-input" type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
            <input className="control-input" type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
            <input className="control-input" type="number" min="0.01" step="0.01" placeholder="Percent" value={adjustmentPercent} onChange={e => setAdjustmentPercent(e.target.value)} />
            <button type="button" onClick={() => { void handleApplyServiceFeeAdjustment(); }} className="action-btn-secondary">
              Apply Service Adjustment
            </button>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Eligible operational total in range: {formatValue(operationalWeightRangeTotal.surcharge || 0)} across {operationalWeightRangeTotal.activities} activities.
          </p>
        </div>
      )}

      <div className="section-card p-5 lg:p-6 space-y-4">
        <h3 className="text-base font-medium text-stone-900 dark:text-stone-100">{tx('Adjustment Requests')}</h3>
        {canManageEntityTx && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="control-input" type="number" min="0.01" step="0.01" placeholder="Requested Amount" value={requestAmount} onChange={e => setRequestAmount(e.target.value)} />
            <button type="button" onClick={() => { void handleCreateOutputRequest(); }} className="action-btn-secondary">
              Submit Request
            </button>
          </div>
        )}

        <div className="space-y-2">
          {entityRequests.length === 0 && <p className="text-sm text-stone-500 dark:text-stone-400">{tx('No output requests yet.')}</p>}
          {entityRequests.map(request => (
            <div key={request.id} className="rounded-lg border border-stone-200 dark:border-stone-800 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm text-stone-900 dark:text-stone-100">{formatValue(request.unit_amount)} • {request.created_at ? formatDate(request.created_at) : 'No timestamp'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'text-xs px-2 py-1 rounded-full border',
                  request.status === 'pending'
                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400'
                    : request.status === 'applied'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'
                      : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'
                )}>
                  {request.status}
                </span>
                {request.status === 'pending' && canAlign && (
                  <>
                    {isAdmin && (
                      <button type="button" onClick={() => { void resolveRequest(request, 'approved'); }} className="action-btn-primary text-xs px-2.5 py-1">
                        <Check size={12} />
                        Approve
                      </button>
                    )}
                    {isAdmin && (
                      <button type="button" onClick={() => { void resolveRequest(request, 'rejected'); }} className="action-btn-secondary text-xs px-2.5 py-1">
                        <X size={12} />
                        Reject
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section-card p-5 lg:p-6 space-y-3">
        <h3 className="text-base font-medium text-stone-900 dark:text-stone-100">Operations Activity Log</h3>
        {operatorActions.length === 0 && (
          <p className="text-sm text-stone-500 dark:text-stone-400">{tx('No operator actions yet.')}</p>
        )}
        {operatorActions.length > 0 && (
          <div className="space-y-2">
            {operatorActions.map(operation => (
              <div key={operation.id} className="rounded-lg border border-stone-200 dark:border-stone-800 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-stone-900 dark:text-stone-100">{operation.action}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{formatDate(operation.occurredAt)}</p>
                </div>
                <p className={cn(
                  'font-mono text-sm',
                  operation.action.toLowerCase().includes('rejected') ? 'text-stone-500 dark:text-stone-400' : 'text-emerald-600 dark:text-emerald-400',
                )}>
                  {formatValue(operation.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section-card p-5 lg:p-6 space-y-3">
        <h3 className="text-base font-medium text-stone-900 dark:text-stone-100">Entity Account Entries</h3>
        {entityEntries.length === 0 && <p className="text-sm text-stone-500 dark:text-stone-400">No records posted yet.</p>}
        {entityEntries.length > 0 && (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                <tr>
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Direction</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entityEntries.map((record: ActivityRecord) => (
                  <tr key={record.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                    <td className="px-4 py-3 text-stone-500 font-mono text-[10px]">
                      {record.created_at ? formatDate(record.created_at) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-xs font-bold uppercase",
                        record.direction === 'increase' ? "text-emerald-600" : "text-amber-600"
                      )}>
                        {record.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm font-medium text-stone-900 dark:text-stone-100">
                      {formatValue(record.unit_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className={cn(
          "section-card relative overflow-hidden p-4 lg:p-5 transition-all",
          isOverrideExpanded
            ? "border-2 border-red-600/80 dark:border-red-500/80 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/20"
            : "border border-stone-200/90 dark:border-stone-800/90 bg-stone-50/35 dark:bg-stone-900/35"
        )}>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-red-500 via-orange-500 to-amber-500 opacity-85" />
          <button
            type="button"
            onClick={() => setIsOverrideExpanded(!isOverrideExpanded)}
            className="relative z-10 ml-2 flex w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left"
          >
            <div className="flex items-center gap-2.5">
              <svg aria-hidden="true" viewBox="0 0 20 20" className={cn("h-4 w-4", isOverrideExpanded ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400") }>
                <path d="M10 2.2l8 14.1a1.2 1.2 0 01-1.03 1.7H3.03A1.2 1.2 0 012 16.3L10 2.2z" fill="currentColor" />
                <rect x="9.2" y="6.4" width="1.6" height="5.9" rx="0.8" fill="#fff" />
                <circle cx="10" cy="14.7" r="1" fill="#fff" />
              </svg>
              <h3 className={cn(
                "tracking-wide transition-colors",
                isOverrideExpanded
                  ? "text-sm font-semibold uppercase text-red-700 dark:text-red-300"
                  : "text-[11px] font-medium uppercase text-stone-500 dark:text-stone-400"
              )}>
                Emergency Override
              </h3>
            </div>
            <ChevronDown size={18} className={cn(
              "transition-transform",
              isOverrideExpanded ? "rotate-180 text-red-600 dark:text-red-400" : "text-stone-400"
            )} />
          </button>

          {isOverrideExpanded && (
            <div className="relative z-10 ml-2 mt-2 space-y-3 rounded-md border border-red-200/70 bg-white/65 p-3 dark:border-red-900/40 dark:bg-stone-900/55">
              <p className="text-xs font-medium text-red-700 dark:text-red-300">
                High-variance action. Use only for emergency alignment. This writes audited adjustment records instead of mutating profile total directly.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  className="control-input border-red-200/70 focus:border-red-400 dark:border-red-900/40"
                  type="number"
                  step="0.01"
                  placeholder="Target Total"
                  value={overrideTargetTotal}
                  onChange={e => setOverrideTargetTotal(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => { void handleManualOverride(); }}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Apply Override
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isSnapshotOpen && (
        <EntitySnapshot
          entity={unit}
          type="entity"
          onClose={() => setIsSnapshotOpen(false)}
          onUpdateTags={handleUpdateEntityTags}
          activityNet={performanceDelta}
          variant="modal"
        />
      )}
    </div>
  );
}