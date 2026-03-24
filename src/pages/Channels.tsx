import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { Plus, ArrowUpRight, ArrowDownLeft, Circle, SquareStack, AlertCircle, Trash2, Pencil } from 'lucide-react';
import { formatCompactValue, formatValue, formatDate } from '../lib/utils';
import ChannelCharts from '../components/charts/ChannelCharts';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import MobileActivityRecordCard from '../components/MobileActivityRecordCard';
import { useAppRole } from '../context/AppRoleContext';
import { ActivityRecord } from '../types';
import LoadingLine from '../components/LoadingLine';
import { useNotification } from '../context/NotificationContext';
import CollapsibleActivitySection from '../components/CollapsibleActivitySection';
import DataActionMenu from '../components/DataActionMenu';
import { useLabels } from '../lib/labels';
import { useLocation, useNavigate } from 'react-router-dom';
import EmptyState from '../components/EmptyState';

export default function Channels({ embedded = false }: { embedded?: boolean }) {
  // Pull only canonical DataContext properties
  const {
    entities: rawEntities,
    records: rawRecords,
    channels: rawChannels,
    addChannelRecord,
    loading,
    loadingProgress,
  } = useData();

  // Defensive guards — no collection can be undefined
  const entities = rawEntities ?? [];
  const records = rawRecords ?? [];
  const channels = rawChannels ?? [];

  // Derive channelEntries from canonical records (applied records that have a direction)
  // This replaces the removed channelEntries API
  const channelEntries = useMemo(() =>
    records.filter(r => r.status === 'applied'),
    [records]
  );

  // Removed APIs — stubbed as safe no-ops until the Channels page is fully migrated
  const adjustments: any[] = [];
  const adjustmentRequests: any[] = [];
  const transferAccounts: any[] = [];
  const deleteChannelActivityRecord = async (_id: string) => {};
  const addAdjustment = async (_data: any) => {};
  const deleteAdjustment = async (_id: string) => {};
  const resolveAdjustmentRequest = async (_id: string, _status: string) => {};
  const transferChannelValues = async (_data: any) => {};
  const recordSystemEvent = async (_data: any) => {};
  const addTransferAccount = async (_data: any) => {};
  const updateTransferAccount = async (_data: any) => {};
  const deleteTransferAccount = async (_id: string) => {};
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccessAdminUi } = useAppRole();
  const { tx } = useLabels();
  const canOperateValue = canAccessAdminUi;
  const { notify } = useNotification();

  // Account Management State
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [acctName, setAcctName] = useState('');
  const [acctCategory, setAcctCategory] = useState('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [accountSaveState, setAccountSaveState] = useState<'idle' | 'saved'>('idle');

  // Channel State
  const [isAddingActivityRecord, setIsAddingActivityRecord] = useState(false);
  const [isTransferringToChannel, setIsTransferringToChannel] = useState(false);
  const [transType, setTransType] = useState<'increment' | 'decrement'>('increment');
  const [transAmount, setTransAmount] = useState('');
  const [transMethodBase, setTransMethodBase] = useState('channel_account');
  const [transMethodCustom, setTransMethodCustom] = useState('');
  const [transAccountLabel, setTransAccountLabel] = useState('');
  const [isSavingActivityRecord, setIsSavingActivityRecord] = useState(false);
  const [saveActivityRecordProgress, setSaveActivityRecordProgress] = useState(0);
  const [recordSaveState, setRecordSaveState] = useState<'idle' | 'saved'>('idle');
  const [deletingChannelActivityRecordId, setDeletingChannelActivityRecordId] = useState<string | null>(null);
  const [archivedChannelActivityRecordIds, setArchivedChannelActivityRecordIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('channel.archivedActivityRecordIds');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const [isArchivedActivityRecordsExpanded, setIsArchivedActivityRecordsExpanded] = useState(false);
  const [transferFromMethod, setTransferFromMethod] = useState('');
  const [transferFromQuery, setTransferFromQuery] = useState('');
  const [transferToChannelLabel, setTransferToChannelLabel] = useState('');
  const [transferAmount, settransferAmount] = useState('');
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);
  const [saveTransferProgress, setSaveTransferProgress] = useState(0);
  const [transferSaveState, setTransferSaveState] = useState<'idle' | 'saved'>('idle');

  const parseMethod = (method: string) => {
    const [base, ...rest] = method.split('::');
    return {
      base: base || 'other',
      account: rest.join('::').trim(),
    };
  };

  const composeMethod = (base: string, account: string) => {
    const trimmed = account.trim();
    return trimmed ? `${base}::${trimmed}` : base;
  };

  const formatChannelLabel = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Other';
    if (trimmed === 'channel_account') return 'Channel';
    if (trimmed === 'value') return 'Value';
    return trimmed
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  };

  const normalizeChannelKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

  const baseMethodLabel = (base: string) => {
    return formatChannelLabel(base);
  };

  const CHANNEL_PALETTES = [
    { badgeClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300', chartColor: '#10b981' },
    { badgeClass: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300', chartColor: '#0ea5e9' },
    { badgeClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300', chartColor: '#f59e0b' },
    { badgeClass: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-950/40 dark:text-fuchsia-300', chartColor: '#d946ef' },
    { badgeClass: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300', chartColor: '#f43f5e' },
    { badgeClass: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300', chartColor: '#8b5cf6' },
    { badgeClass: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300', chartColor: '#06b6d4' },
    { badgeClass: 'bg-lime-50 text-lime-600 dark:bg-lime-950/40 dark:text-lime-300', chartColor: '#84cc16' },
  ] as const;

  const hashChannel = (value: string) => {
    let hash = 0;
    for (const char of value) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }
    return hash;
  };

  const ChannelGlyph = ({ base, className = 'h-4 w-4' }: { base: string; className?: string }) => {
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
  };

  const getChannelVisual = (base: string) => {
    const palette = CHANNEL_PALETTES[hashChannel(normalizeChannelKey(base) || 'other') % CHANNEL_PALETTES.length];
    return {
      badgeClass: palette.badgeClass,
      chartColor: palette.chartColor,
      icon: <ChannelGlyph base={base} />,
    };
  };

  // Adjustment State
  const [isAddingAdjustment, setIsAddingAdjustment] = useState(false);
  const [adjustmentUnitId, setAdjustmentUnitId] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<'input' | 'output'>('input');
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  const [saveAdjustmentProgress, setSaveAdjustmentProgress] = useState(0);
  const [adjustmentSaveState, setAdjustmentSaveState] = useState<'idle' | 'saved'>('idle');
  const [deletingAdjustmentId, setDeletingAdjustmentId] = useState<string | null>(null);
  const [settlingActivityRecordId, setSettlingActivityRecordId] = useState<string | null>(null);
  const [settleAccountBase, setSettleAccountBase] = useState('channel_account');
  const [settleAccountCustom, setSettleAccountCustom] = useState('');
  const [settleAccountLabel, setSettleAccountLabel] = useState('');
  const [isSettlingActivityRecord, setIsSettlingActivityRecord] = useState(false);
  const [archivedAdjustmentIds, setArchivedAdjustmentIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('channel.archivedAdjustmentIds');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const [isArchivedAdjustmentsExpanded, setIsArchivedAdjustmentsExpanded] = useState(false);
  const [orgSearchQuery, setOrgSearchQuery] = useState('');
  const [orgTypeFilter, setOrgTypeFilter] = useState<'all' | 'increment' | 'decrement'>('all');
  const [orgDateStart, setOrgDateStart] = useState('');
  const [orgDateEnd, setOrgDateEnd] = useState('');
  const [isTxControlsVisible, setIsTxControlsVisible] = useState(false);
  const [isAdjustmentControlsVisible, setIsAdjustmentControlsVisible] = useState(false);
  const [adjustmentSearchQuery, setAdjustmentSearchQuery] = useState('');
  const [adjustmentTypeFilter, setAdjustmentTypeFilter] = useState<'all' | 'input' | 'output'>('all');
  const [retentionDays, setRetentionDays] = useState(() => {
    if (typeof window === 'undefined') return '90';
    return window.localStorage.getItem('channel.retentionDays') || '90';
  });
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('channel.autoArchiveEnabled') === 'true';
  });
  const saveActivityRecordProgressTimerRef = useRef<number | null>(null);
  const saveActivityRecordProgressResetTimerRef = useRef<number | null>(null);
  const saveActivityRecordSuccessResetTimerRef = useRef<number | null>(null);
  const saveTransferProgressTimerRef = useRef<number | null>(null);
  const saveTransferProgressResetTimerRef = useRef<number | null>(null);
  const saveTransferSuccessResetTimerRef = useRef<number | null>(null);
  const saveAdjustmentProgressTimerRef = useRef<number | null>(null);
  const saveAdjustmentProgressResetTimerRef = useRef<number | null>(null);
  const saveAdjustmentSuccessResetTimerRef = useRef<number | null>(null);
  const saveAccountSuccessResetTimerRef = useRef<number | null>(null);
  const recordHistoryRef = useRef<HTMLDivElement>(null);

  const clearSaveActivityRecordTimers = () => {
    if (saveActivityRecordProgressTimerRef.current !== null) {
      window.clearInterval(saveActivityRecordProgressTimerRef.current);
      saveActivityRecordProgressTimerRef.current = null;
    }
    if (saveActivityRecordProgressResetTimerRef.current !== null) {
      window.clearTimeout(saveActivityRecordProgressResetTimerRef.current);
      saveActivityRecordProgressResetTimerRef.current = null;
    }
  };

  const clearSaveAdjustmentTimers = () => {
    if (saveAdjustmentProgressTimerRef.current !== null) {
      window.clearInterval(saveAdjustmentProgressTimerRef.current);
      saveAdjustmentProgressTimerRef.current = null;
    }
    if (saveAdjustmentProgressResetTimerRef.current !== null) {
      window.clearTimeout(saveAdjustmentProgressResetTimerRef.current);
      saveAdjustmentProgressResetTimerRef.current = null;
    }
  };

  const clearSaveTransferTimers = () => {
    if (saveTransferProgressTimerRef.current !== null) {
      window.clearInterval(saveTransferProgressTimerRef.current);
      saveTransferProgressTimerRef.current = null;
    }
    if (saveTransferProgressResetTimerRef.current !== null) {
      window.clearTimeout(saveTransferProgressResetTimerRef.current);
      saveTransferProgressResetTimerRef.current = null;
    }
  };

  useEffect(() => () => {
    clearSaveActivityRecordTimers();
    clearSaveTransferTimers();
    clearSaveAdjustmentTimers();
    if (saveActivityRecordSuccessResetTimerRef.current !== null) {
      window.clearTimeout(saveActivityRecordSuccessResetTimerRef.current);
      saveActivityRecordSuccessResetTimerRef.current = null;
    }
    if (saveTransferSuccessResetTimerRef.current !== null) {
      window.clearTimeout(saveTransferSuccessResetTimerRef.current);
      saveTransferSuccessResetTimerRef.current = null;
    }
    if (saveAdjustmentSuccessResetTimerRef.current !== null) {
      window.clearTimeout(saveAdjustmentSuccessResetTimerRef.current);
      saveAdjustmentSuccessResetTimerRef.current = null;
    }
    if (saveAccountSuccessResetTimerRef.current !== null) {
      window.clearTimeout(saveAccountSuccessResetTimerRef.current);
      saveAccountSuccessResetTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action !== 'add-deferred' && action !== 'add-immediate' && action !== 'add-account' && action !== 'toggle-filters') return;

    if (!canOperateValue) {
      notify({ type: 'error', message: 'Only admin can add total records.' });
      return;
    }

    if (action === 'add-account') {
      openAddAccount();
    } else if (action === 'toggle-filters') {
      recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsTxControlsVisible(value => !value);
    } else {
      setTransType(action === 'add-immediate' ? 'decrement' : 'increment');
      setIsAddingActivityRecord(true);
      recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    params.delete('action');
    const next = params.toString();
    navigate({ pathname: location.pathname, search: next ? `?${next}` : '' }, { replace: true });
  }, [canOperateValue, location.pathname, location.search, navigate, notify]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('channel.archivedActivityRecordIds', JSON.stringify(archivedChannelActivityRecordIds));
  }, [archivedChannelActivityRecordIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('channel.archivedAdjustmentIds', JSON.stringify(archivedAdjustmentIds));
  }, [archivedAdjustmentIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('channel.retentionDays', retentionDays);
  }, [retentionDays]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('channel.autoArchiveEnabled', autoArchiveEnabled ? 'true' : 'false');
  }, [autoArchiveEnabled]);

  // Calculate Totals
  const {
    channelTotals,
    totalChannel,
    unresolvedOutflowMethods,
    unresolvedOutflowAmount,
    channelCardData,
    p2pChannelOptions,
    channelLabelSuggestions,
  } = useMemo(() => {
    const nextChannelTotals: Record<string, number> = {};

    channelEntries.forEach(record => {
      const multiplier = record.type === 'increment' ? 1 : -1;
      const amount = record.amount * multiplier;
      nextChannelTotals[record.method] = (nextChannelTotals[record.method] || 0) + amount;
    });

    const nextTotalChannel = Object.values(nextChannelTotals).reduce((sum, value) => sum + value, 0);
    const nextUnresolvedOutflowMethods = Object.records(nextChannelTotals)
      .filter(([, value]) => value < 0)
      .map(([method, value]) => ({ method, amount: Math.abs(value) }));
    const nextUnresolvedOutflowAmount = nextUnresolvedOutflowMethods.reduce((sum, item) => sum + item.amount, 0);

    const nextChannelCardData = Object.records(nextChannelTotals)
      .map(([method, amount]) => ({
        method,
        amount,
        label: (() => {
          const { base, account } = parseMethod(method);
          const label = baseMethodLabel(base);
          return account ? `${label} • ${account}` : label;
        })(),
        base: parseMethod(method).base,
      }))
      .sort((a, b) => b.amount - a.amount);

    const nextP2pChannelOptions = nextChannelCardData.filter(item => item.base !== 'channel_account' && item.base !== 'value' && item.amount > 0);
    const nextChannelLabelSuggestions = Array.from(new Set(
      nextChannelCardData
        .filter(item => item.base === 'channel_account')
        .map(item => parseMethod(item.method).account)
        .filter((account): account is string => Boolean(account && account.trim()))
    ));

    return {
      channelTotals: nextChannelTotals,
      totalChannel: nextTotalChannel,
      unresolvedOutflowMethods: nextUnresolvedOutflowMethods,
      unresolvedOutflowAmount: nextUnresolvedOutflowAmount,
      channelCardData: nextChannelCardData,
      p2pChannelOptions: nextP2pChannelOptions,
      channelLabelSuggestions: nextChannelLabelSuggestions,
    };
  }, [channelEntries]);

  const hasUnresolvedOutflowAlert = unresolvedOutflowAmount > 0.009;

  const topChannelInsight = useMemo(() => {
    const primaryChannel = channelCardData.find(item => item.amount > 0) ?? channelCardData[0] ?? null;
    if (!primaryChannel || Math.abs(totalChannel) < 0.01) {
      return { label: tx('No active channel'), share: tx('0%') };
    }

    const share = Math.max(0, Math.min(100, (primaryChannel.amount / totalChannel) * 100));
    return {
      label: primaryChannel.label,
      share: `${Math.round(share)}%`,
    };
  }, [channelCardData, totalChannel, tx]);

  const archivedChannelActivityRecordIdSet = useMemo(() => new Set(archivedChannelActivityRecordIds), [archivedChannelActivityRecordIds]);
  const activeChannelEntries = useMemo(
    () => channelEntries.filter(record => !archivedChannelActivityRecordIdSet.has(record.id)),
    [channelEntries, archivedChannelActivityRecordIdSet]
  );
  const archivedChannelEntries = useMemo(
    () => channelEntries.filter(record => archivedChannelActivityRecordIdSet.has(record.id)),
    [channelEntries, archivedChannelActivityRecordIdSet]
  );
  const retentionDaysNumber = useMemo(() => {
    const parsed = Number(retentionDays);
    if (!Number.isFinite(parsed)) return 90;
    return Math.max(1, Math.floor(parsed));
  }, [retentionDays]);

  const normalizedOrgSearch = orgSearchQuery.trim().toLowerCase();
  const filteredActiveChannelEntries = useMemo(() => activeChannelEntries.filter(record => {
    if (orgTypeFilter !== 'all' && record.type !== orgTypeFilter) return false;
    if (orgDateStart && record.date < orgDateStart) return false;
    if (orgDateEnd && record.date > orgDateEnd) return false;
    if (!normalizedOrgSearch) return true;
    return (
      record.method.toLowerCase().includes(normalizedOrgSearch)
      || record.date.toLowerCase().includes(normalizedOrgSearch)
    );
  }), [activeChannelEntries, orgTypeFilter, orgDateStart, orgDateEnd, normalizedOrgSearch]);

  const filteredArchivedChannelEntries = useMemo(() => archivedChannelEntries.filter(record => {
    if (orgTypeFilter !== 'all' && record.type !== orgTypeFilter) return false;
    if (orgDateStart && record.date < orgDateStart) return false;
    if (orgDateEnd && record.date > orgDateEnd) return false;
    if (!normalizedOrgSearch) return true;
    return (
      record.method.toLowerCase().includes(normalizedOrgSearch)
      || record.date.toLowerCase().includes(normalizedOrgSearch)
    );
  }), [archivedChannelEntries, orgTypeFilter, orgDateStart, orgDateEnd, normalizedOrgSearch]);

  const oldChannelActivityRecordIds = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - retentionDaysNumber);
    const thresholdTime = threshold.getTime();
    return activeChannelEntries
      .filter(record => {
        const date = new Date(record.date);
        return Number.isFinite(date.getTime()) && date.getTime() < thresholdTime;
      })
      .map(record => record.id);
  }, [activeChannelEntries, retentionDaysNumber]);

  // Calculate Outstanding Adjustments
  const totalOutstanding = useMemo(() => {
    const unitAdjustmentTotals: Record<string, number> = {};
    adjustments.forEach(adjustment => {
      if (!unitAdjustmentTotals[adjustment.entity_id]) unitAdjustmentTotals[adjustment.entity_id] = 0;
      const multiplier = adjustment.type === 'input' ? 1 : -1;
      unitAdjustmentTotals[adjustment.entity_id] += adjustment.amount * multiplier;
    });
    return Object.values(unitAdjustmentTotals).reduce((sum, value) => sum + value, 0);
  }, [adjustments]);

  const archivedAdjustmentIdSet = useMemo(() => new Set(archivedAdjustmentIds), [archivedAdjustmentIds]);
  const activeAdjustments = useMemo(() => adjustments.filter(adjustment => !archivedAdjustmentIdSet.has(adjustment.id)), [adjustments, archivedAdjustmentIdSet]);
  const archivedAdjustments = useMemo(() => adjustments.filter(adjustment => archivedAdjustmentIdSet.has(adjustment.id)), [adjustments, archivedAdjustmentIdSet]);
  const normalizedAdjustmentSearch = adjustmentSearchQuery.trim().toLowerCase();
  const filteredActiveAdjustments = useMemo(() => activeAdjustments.filter(adjustment => {
    if (adjustmentTypeFilter !== 'all' && adjustment.type !== adjustmentTypeFilter) return false;
    if (!normalizedAdjustmentSearch) return true;
    const unitName = (entities.find(unit => unit.id === adjustment.entity_id)?.name || '').toLowerCase();
    return (
      unitName.includes(normalizedAdjustmentSearch)
      || adjustment.date.toLowerCase().includes(normalizedAdjustmentSearch)
    );
  }), [activeAdjustments, adjustmentTypeFilter, normalizedAdjustmentSearch, entities]);

  const filteredArchivedAdjustments = useMemo(() => archivedAdjustments.filter(adjustment => {
    if (adjustmentTypeFilter !== 'all' && adjustment.type !== adjustmentTypeFilter) return false;
    if (!normalizedAdjustmentSearch) return true;
    const unitName = (entities.find(unit => unit.id === adjustment.entity_id)?.name || '').toLowerCase();
    return (
      unitName.includes(normalizedAdjustmentSearch)
      || adjustment.date.toLowerCase().includes(normalizedAdjustmentSearch)
    );
  }), [archivedAdjustments, adjustmentTypeFilter, normalizedAdjustmentSearch, entities]);

  const oldAdjustmentIds = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - retentionDaysNumber);
    const thresholdTime = threshold.getTime();
    return activeAdjustments
      .filter(adjustment => {
        const date = new Date(adjustment.date);
        return Number.isFinite(date.getTime()) && date.getTime() < thresholdTime;
      })
      .map(adjustment => adjustment.id);
  }, [activeAdjustments, retentionDaysNumber]);

  const settledAdjustmentActivityRecordIds = useMemo(() => {
    const unitTotals = new Map<string, number>();
    activeAdjustments.forEach(adjustment => {
      const current = unitTotals.get(adjustment.entity_id) || 0;
      const next = current + (adjustment.type === 'input' ? adjustment.amount : -adjustment.amount);
      unitTotals.set(adjustment.entity_id, next);
    });
    const settledUnits = new Set(
      Array.from(unitTotals.records())
        .filter(([, total]) => Math.abs(total) < 0.01)
        .map(([unitId]) => unitId)
    );
    return activeAdjustments.filter(adjustment => settledUnits.has(adjustment.entity_id)).map(adjustment => adjustment.id);
  }, [activeAdjustments]);

  const pendingAdjustmentRequests = useMemo(
    () => adjustmentRequests
      .filter(request => request.status === 'pending')
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at)),
    [adjustmentRequests],
  );

  useEffect(() => {
    if (!autoArchiveEnabled) return;

    const txIds = oldChannelActivityRecordIds;
    if (txIds.length > 0) {
      setArchivedChannelActivityRecordIds(current => {
        const next = new Set(current);
        txIds.forEach(id => next.add(id));
        if (next.size === current.length) return current;
        void recordSystemEvent({
          action: 'channel_entries_auto_archived',
          entity: 'channel',
          amount: txIds.length,
          details: `Auto-archived channel records older than ${retentionDaysNumber} days`,
        });
        return Array.from(next);
      });
    }

    const adjustmentIds = Array.from(new Set([...oldAdjustmentIds, ...settledAdjustmentActivityRecordIds]));
    if (adjustmentIds.length > 0) {
      setArchivedAdjustmentIds(current => {
        const next = new Set(current);
        adjustmentIds.forEach(id => next.add(id));
        if (next.size === current.length) return current;
        void recordSystemEvent({
          action: 'adjustment_entries_auto_archived',
          entity: 'adjustment',
          amount: adjustmentIds.length,
          details: `Auto-archived settled/old deferred records with retention ${retentionDaysNumber} days`,
        });
        return Array.from(next);
      });
    }
  }, [autoArchiveEnabled, oldChannelActivityRecordIds, oldAdjustmentIds, recordSystemEvent, retentionDaysNumber, settledAdjustmentActivityRecordIds]);

  const formatMethodLabel = (method: any) => {
    const { base, account } = parseMethod(method);
    const label = baseMethodLabel(base);
    return account ? `${label} • ${account}` : label;
  };

  const isTransferActivityRecord = (record: any) => record.method?.includes('::');

  const handleTotalCardClick = (base: string) => {
    recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!canOperateValue) return;

    setIsAddingActivityRecord(true);
    setTransType('increment');
    setTransMethodCustom('');

    if (base === 'value') {
      setTransMethodBase('channel_account');
      return;
    }

    setTransMethodBase(base || 'channel_account');
  };

  // --- Chart Data Preparation ---

  const distributionData = useMemo(() => {
    return channelCardData
      .filter(item => Math.abs(item.amount) > 0.01)
      .map(item => ({
        name: item.label,
        value: Math.abs(item.amount),
        color: getChannelVisual(item.base).chartColor,
      }));
  }, [channelCardData]);

  const historyData = useMemo(() => {
    const sorted = [...channelEntries].sort((a, b) => a.date.localeCompare(b.date));
    const points: { date: string; total: number; fullDate: string }[] = [];
    let runningTotal = 0;
    
    // Group by date to avoid plot saturation
    const dailyTotals: Record<string, number> = {};
    sorted.forEach(tx => {
      const multiplier = tx.type === 'increment' ? 1 : -1;
      runningTotal += tx.amount * multiplier;
      dailyTotals[tx.date] = runningTotal;
    });

    Object.records(dailyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([date, total]) => {
        points.push({
          date: formatDate(date),
          total: total,
          fullDate: date
        });
      });

    return points.slice(-30); // Last 30 days of activity
  }, [channelEntries, formatDate]);

  const p2pOptionDisplay = (method: string, amount: number) => `${formatMethodLabel(method)} (${formatValue(amount)})`;

  const CHANNEL_CATEGORY_CHOICES = [
    { value: 'channel_account', label: 'Channel' },
    { value: 'value', label: 'Value' },
    { value: 'asset', label: 'Asset' },
    { value: 'other', label: 'Other' },
    { value: '__custom__', label: '+ New channel label…' },
  ];

  const availableChannelCategories = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();

    for (const choice of CHANNEL_CATEGORY_CHOICES) {
      if (choice.value === '__custom__') continue;
      options.set(normalizeChannelKey(choice.value), choice);
    }

    for (const account of transferAccounts) {
      const key = normalizeChannelKey(account.category);
      if (!key) continue;
      options.set(key, { value: account.category, label: baseMethodLabel(account.category) });
    }

    for (const item of channelCardData) {
      const key = normalizeChannelKey(item.base);
      if (!key) continue;
      options.set(key, { value: item.base, label: baseMethodLabel(item.base) });
    }

    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [baseMethodLabel, channelCardData, transferAccounts]);

  const openAddAccount = () => {
    setEditingAccount(null);
    setAcctName('');
    setAcctCategory('');
    setIsAddingAccount(true);
  };

  const openEditAccount = (account: any) => {
    setEditingAccount(account);
    setAcctCategory(account.category);
    setAcctName(account.name);
    setIsAddingAccount(true);
  };

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
      if (!canOperateValue) return;

      if (normalizedKey === 'i') {
        event.preventDefault();
        setTransType('increment');
        setIsAddingActivityRecord(true);
        recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (normalizedKey === 'o') {
        event.preventDefault();
        setTransType('decrement');
        setIsAddingActivityRecord(true);
        recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (normalizedKey === 'a') {
        event.preventDefault();
        openAddAccount();
        return;
      }

      if (normalizedKey === 'f') {
        event.preventDefault();
        recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setIsTxControlsVisible(value => !value);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [canOperateValue]);

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOperateValue || isSavingAccount) return;
    setIsSavingAccount(true);
    const resolvedCategory = acctCategory.trim();
    if (!resolvedCategory) {
      setIsSavingAccount(false);
      notify({ type: 'error', message: 'Enter a channel label.' });
      return;
    }
    try {
      if (editingAccount) {
        await updateTransferAccount({
          ...editingAccount,
          name: acctName.trim(),
          category: resolvedCategory
        });
        notify({ type: 'success', message: 'Account updated.' });
      } else {
        await addTransferAccount({
          name: acctName.trim(),
          category: resolvedCategory,
          is_active: true
        });
        notify({ type: 'success', message: 'Account saved.' });
      }
      setAccountSaveState('saved');
      if (saveAccountSuccessResetTimerRef.current !== null) {
        window.clearTimeout(saveAccountSuccessResetTimerRef.current);
      }
      saveAccountSuccessResetTimerRef.current = window.setTimeout(() => {
        setAccountSaveState('idle');
        saveAccountSuccessResetTimerRef.current = null;
      }, 2000);
      setIsAddingAccount(false);
      setEditingAccount(null);
      setAcctName('');
      setAcctCategory('');
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Unable to save account.' });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!canOperateValue || deletingAccountId) return;
    const confirmed = window.confirm('Confirm remove this account?');
    if (!confirmed) return;
    setDeletingAccountId(id);
    try {
      await deleteTransferAccount(id);
      notify({ type: 'success', message: 'Account removed.' });
    } catch (err: any) {
      notify({ type: 'error', message: err?.message || 'Unable to delete account.' });
    } finally {
      setDeletingAccountId(null);
    }
  };

  const handleAddActivityRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOperateValue || isSavingActivityRecord) return;
    const resolvedMethodBase = transMethodBase === '__custom__' ? transMethodCustom.trim() : transMethodBase;
    if (!resolvedMethodBase) {
      notify({ type: 'error', message: 'Enter a channel label before saving.' });
      return;
    }
    clearSaveActivityRecordTimers();
    setIsSavingActivityRecord(true);
    let progress = 8;
    setSaveActivityRecordProgress(progress);
    saveActivityRecordProgressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + (progress < 70 ? 10 : progress < 90 ? 4 : 1), 92);
      setSaveActivityRecordProgress(progress);
    }, 120);

    const today = new Date().toISOString().split('T')[0];
    try {
      await addChannelRecord({
        type: transType,
        amount: parseFloat(transAmount),
        method: composeMethod(resolvedMethodBase, transAccountLabel),
        date: today
      });
      clearSaveActivityRecordTimers();
      setSaveActivityRecordProgress(100);
      setIsAddingActivityRecord(false);
      setTransAmount('');
      setTransMethodBase('channel_account');
      setTransMethodCustom('');
      setTransAccountLabel('');
      setRecordSaveState('saved');
      if (saveActivityRecordSuccessResetTimerRef.current !== null) {
        window.clearTimeout(saveActivityRecordSuccessResetTimerRef.current);
      }
      saveActivityRecordSuccessResetTimerRef.current = window.setTimeout(() => {
        setRecordSaveState('idle');
        saveActivityRecordSuccessResetTimerRef.current = null;
      }, 2000);
      notify({ type: 'success', message: 'ActivityRecord saved.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to save record.' });
    } finally {
      saveActivityRecordProgressResetTimerRef.current = window.setTimeout(() => {
        setIsSavingActivityRecord(false);
        setSaveActivityRecordProgress(0);
        saveActivityRecordProgressResetTimerRef.current = null;
      }, 360);
    }
  };

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOperateValue || isSavingAdjustment) return;
    clearSaveAdjustmentTimers();
    setIsSavingAdjustment(true);
    let progress = 8;
    setSaveAdjustmentProgress(progress);
    saveAdjustmentProgressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + (progress < 70 ? 10 : progress < 90 ? 4 : 1), 92);
      setSaveAdjustmentProgress(progress);
    }, 120);

    const today = new Date().toISOString().split('T')[0];
    try {
      await addAdjustment({
        entity_id: adjustmentUnitId,
        amount: parseFloat(adjustmentAmount),
        type: adjustmentType,
        date: today
      });
      clearSaveAdjustmentTimers();
      setSaveAdjustmentProgress(100);
      setIsAddingAdjustment(false);
      setAdjustmentUnitId('');
      setAdjustmentAmount('');
      setAdjustmentSaveState('saved');
      if (saveAdjustmentSuccessResetTimerRef.current !== null) {
        window.clearTimeout(saveAdjustmentSuccessResetTimerRef.current);
      }
      saveAdjustmentSuccessResetTimerRef.current = window.setTimeout(() => {
        setAdjustmentSaveState('idle');
        saveAdjustmentSuccessResetTimerRef.current = null;
      }, 2000);
      notify({ type: 'success', message: 'Live deferred record recorded.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to add live deferred record.' });
    } finally {
      saveAdjustmentProgressResetTimerRef.current = window.setTimeout(() => {
        setIsSavingAdjustment(false);
        setSaveAdjustmentProgress(0);
        saveAdjustmentProgressResetTimerRef.current = null;
      }, 360);
    }
  };

  const handleResolveAdjustment = async (requestId: string, status: 'approved' | 'rejected') => {
    if (!canOperateValue) return;
    try {
      await resolveAdjustmentRequest(requestId, status);
      notify({
        type: 'success',
        message: status === 'approved' ? 'Deferred record approved and posted.' : 'Deferred record rejected.',
      });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to resolve deferred record request.' });
    }
  };

  const handleTransferInternalToChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOperateValue || isSavingTransfer) return;

    if (!transferFromMethod) {
      notify({ type: 'error', message: 'Select a source P2P account.' });
      return;
    }

    const parsedAmount = Number(transferAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      notify({ type: 'error', message: 'TransferAmount amount must be greater than 0.' });
      return;
    }

    const available = channelTotals[transferFromMethod] || 0;
    if (parsedAmount > available) {
      notify({ type: 'error', message: 'Insufficient P2P total for this transfer.' });
      return;
    }

    const targetMethod = composeMethod('channel_account', transferToChannelLabel);
    if (transferFromMethod === targetMethod) {
      notify({ type: 'error', message: 'Source and destination accounts must be different.' });
      return;
    }

    clearSaveTransferTimers();
    setIsSavingTransfer(true);
    let progress = 8;
    setSaveTransferProgress(progress);
    saveTransferProgressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + (progress < 70 ? 10 : progress < 90 ? 4 : 1), 92);
      setSaveTransferProgress(progress);
    }, 120);

    const today = new Date().toISOString().split('T')[0];
    try {
      await transferChannelValues(
        transferFromMethod,
        targetMethod,
        parsedAmount,
        today,
      );

      clearSaveTransferTimers();
      setSaveTransferProgress(100);
      setIsTransferringToChannel(false);
      setTransferFromMethod('');
      setTransferFromQuery('');
      setTransferToChannelLabel('');
      settransferAmount('');
      setTransferSaveState('saved');
      if (saveTransferSuccessResetTimerRef.current !== null) {
        window.clearTimeout(saveTransferSuccessResetTimerRef.current);
      }
      saveTransferSuccessResetTimerRef.current = window.setTimeout(() => {
        setTransferSaveState('idle');
        saveTransferSuccessResetTimerRef.current = null;
      }, 2000);
      notify({ type: 'success', message: 'TransferAmount completed successfully.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to complete transfer.' });
    } finally {
      saveTransferProgressResetTimerRef.current = window.setTimeout(() => {
        setIsSavingTransfer(false);
        setSaveTransferProgress(0);
        saveTransferProgressResetTimerRef.current = null;
      }, 360);
    }
  };

  const handleDeleteChannelActivityRecord = async (id: string) => {
    if (!canOperateValue || deletingChannelActivityRecordId === id) return;
    const confirmed = window.confirm('Delete this channel record? This will adjust current channel totals and cannot be undone.');
    if (!confirmed) return;

    try {
      setDeletingChannelActivityRecordId(id);
      await deleteChannelActivityRecord(id);
      notify({ type: 'success', message: 'Channel record deleted.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to delete channel record.' });
    } finally {
      setDeletingChannelActivityRecordId(current => (current === id ? null : current));
    }
  };

  const handleArchiveChannelActivityRecord = (id: string) => {
    setArchivedChannelActivityRecordIds(current => (current.includes(id) ? current : [...current, id]));
    void recordSystemEvent({
      action: 'channel_record_archived',
      entity: 'channel',
      entity_id: id,
      details: 'Channel record moved to archive list',
    });
    notify({ type: 'success', message: 'ActivityRecord archived.' });
  };

  const handleUnarchiveChannelActivityRecord = (id: string) => {
    setArchivedChannelActivityRecordIds(current => current.filter(item => item !== id));
    void recordSystemEvent({
      action: 'channel_record_unarchived',
      entity: 'channel',
      entity_id: id,
      details: 'Channel record restored from archive list',
    });
    notify({ type: 'success', message: 'ActivityRecord restored from archive.' });
  };

  const handleArchiveChannelByDateRange = () => {
    if (!canOperateValue) return;
    if (!orgDateStart || !orgDateEnd) {
      notify({ type: 'error', message: 'Select both start and end date.' });
      return;
    }
    if (orgDateStart > orgDateEnd) {
      notify({ type: 'error', message: 'Start date cannot be after end date.' });
      return;
    }
    const ids = activeChannelEntries
      .filter(record => record.date >= orgDateStart && record.date <= orgDateEnd)
      .map(record => record.id);
    if (ids.length === 0) {
      notify({ type: 'error', message: 'No active channel records in selected range.' });
      return;
    }
    setArchivedChannelActivityRecordIds(current => Array.from(new Set([...current, ...ids])));
    void recordSystemEvent({
      action: 'channel_entries_archived_date_range',
      entity: 'channel',
      amount: ids.length,
      details: `Archived channel records from ${orgDateStart} to ${orgDateEnd}`,
    });
    notify({ type: 'success', message: `Archived ${ids.length} channel records.` });
  };

  const handleArchiveOldChannelActivityRecords = () => {
    if (!canOperateValue) return;
    if (oldChannelActivityRecordIds.length === 0) {
      notify({ type: 'error', message: `No active channel records older than ${retentionDaysNumber} days.` });
      return;
    }
    setArchivedChannelActivityRecordIds(current => Array.from(new Set([...current, ...oldChannelActivityRecordIds])));
    void recordSystemEvent({
      action: 'channel_entries_archived_old',
      entity: 'channel',
      amount: oldChannelActivityRecordIds.length,
      details: `Archived old channel records older than ${retentionDaysNumber} days`,
    });
    notify({ type: 'success', message: `Archived ${oldChannelActivityRecordIds.length} old channel records.` });
  };

  const handleRestoreAllArchivedChannelActivityRecords = () => {
    if (!canOperateValue || archivedChannelActivityRecordIds.length === 0) return;
    const count = archivedChannelActivityRecordIds.length;
    setArchivedChannelActivityRecordIds([]);
    void recordSystemEvent({
      action: 'channel_entries_restored_bulk',
      entity: 'channel',
      amount: count,
      details: 'Restored all archived channel records',
    });
    notify({ type: 'success', message: `Restored ${count} archived channel records.` });
  };

  const handleDeleteAdjustment = async (id: string) => {
    if (!canOperateValue || deletingAdjustmentId === id) return;
    const confirmed = window.confirm('Remove this deferred record? This action cannot be undone.');
    if (!confirmed) return;

    try {
      setDeletingAdjustmentId(id);
      await deleteAdjustment(id);
      notify({ type: 'success', message: 'Deferred record removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove deferred record.' });
    } finally {
      setDeletingAdjustmentId(current => (current === id ? null : current));
    }
  };

  const handleSettleActivityRecord = async (id: string) => {
    if (!canOperateValue || isSettlingActivityRecord) return;
    const record = adjustments.find(l => l.id === id);
    if (!record) return;
    const resolvedSettleBase = settleAccountBase === '__custom__' ? settleAccountCustom.trim() : settleAccountBase;
    if (!resolvedSettleBase) {
      notify({ type: 'error', message: 'Enter a settlement channel label.' });
      return;
    }
    setIsSettlingActivityRecord(true);
    const today = new Date().toISOString().split('T')[0];
    const txType = record.type === 'input' ? 'decrement' : 'increment';
    const method = composeMethod(resolvedSettleBase, settleAccountLabel);
    const contact = entities.find(p => p.id === record.entity_id)?.name || 'contact';
    try {
      await addChannelRecord({
        type: txType,
        amount: record.amount,
        method,
        date: today,
      });
      setArchivedAdjustmentIds(current => (current.includes(id) ? current : [...current, id]));
      setSettlingActivityRecordId(null);
      setSettleAccountBase('channel_account');
      setSettleAccountCustom('');
      setSettleAccountLabel('');
      notify({ type: 'success', message: 'ActivityRecord settled.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Failed to settle record.' });
    } finally {
      setIsSettlingActivityRecord(false);
    }
  };

  const handleArchiveAdjustment = (id: string) => {
    setArchivedAdjustmentIds(current => (current.includes(id) ? current : [...current, id]));
    void recordSystemEvent({
      action: 'deferred_record_archived',
      entity: 'adjustment',
      entity_id: id,
      details: 'Deferred record moved to archive',
    });
    notify({ type: 'success', message: 'Deferred record archived.' });
  };

  const handleUnarchiveAdjustment = (id: string) => {
    setArchivedAdjustmentIds(current => current.filter(item => item !== id));
    void recordSystemEvent({
      action: 'deferred_record_unarchived',
      entity: 'adjustment',
      entity_id: id,
      details: 'Deferred record restored from archive',
    });
    notify({ type: 'success', message: 'Deferred record restored.' });
  };

  const handleArchiveSettledOrOldAdjustments = () => {
    if (!canOperateValue) return;
    const ids = Array.from(new Set([...settledAdjustmentActivityRecordIds, ...oldAdjustmentIds]));
    if (ids.length === 0) {
      notify({ type: 'error', message: 'No settled or old deferred records to archive.' });
      return;
    }
    setArchivedAdjustmentIds(current => Array.from(new Set([...current, ...ids])));
    void recordSystemEvent({
      action: 'deferred_entries_archived_settled_old',
      entity: 'adjustment',
      amount: ids.length,
      details: `Archived settled/old deferred records with retention ${retentionDaysNumber} days`,
    });
    notify({ type: 'success', message: `Archived ${ids.length} settled/old records.` });
  };

  const handleRestoreAllArchivedAdjustments = () => {
    if (!canOperateValue || archivedAdjustmentIds.length === 0) return;
    const count = archivedAdjustmentIds.length;
    setArchivedAdjustmentIds([]);
    void recordSystemEvent({
      action: 'deferred_entries_restored_bulk',
      entity: 'adjustment',
      amount: count,
      details: 'Restored all archived deferred records',
    });
    notify({ type: 'success', message: `Restored ${count} deferred records.` });
  };





  if (loading || loadingProgress > 0) {
    return (
      <div className={cn(embedded ? 'space-y-6' : 'page-shell', 'w-full min-w-0 overflow-x-hidden')}>
        <div className="section-card p-4">
          <LoadingLine
            progress={Math.max(8, Math.min(100, loadingProgress || 8))}
            label="Loading channels..."
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(embedded ? 'space-y-6' : 'page-shell', 'w-full min-w-0 overflow-x-hidden')}>
      {!canOperateValue && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-2 text-sm">
          {tx('Read-only mode: only admin can post live deferred records or approve pending ones.')}
        </div>
      )}
      {!embedded ? (
        <section className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Channels</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">Values management and channel activity.</p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-1">
            <p className="text-[11px] uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">Total</p>
            <p className={cn(
              'font-mono tabular-nums text-4xl leading-tight font-bold',
              totalChannel > 0
                ? 'amount-positive'
                : totalChannel < 0
                  ? 'amount-negative'
                  : 'amount-zero'
            )}>
              {formatValue(totalChannel)}
            </p>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {topChannelInsight.label} · {topChannelInsight.share} · Outstanding: {formatValue(totalOutstanding)}
            </p>
          </div>
        </section>
      ) : (
        <div />
      )}

      {hasUnresolvedOutflowAlert && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Immediate shortfall alert: {formatValue(unresolvedOutflowAmount)} remains unpaid.
              </p>
              <p className="text-xs opacity-90">
                This alert cannot be manually resolved and only clears when the exact amount is paid back.
              </p>
              <p className="text-xs opacity-90">
                Affected channels: {unresolvedOutflowMethods.map(item => `${formatMethodLabel(item.method)} (${formatValue(item.amount)})`).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="section-card p-0 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-px bg-stone-200/70 dark:bg-stone-800/80">
              {channelCardData.length > 0 ? channelCardData.map(item => (
                <TotalCard
                  key={item.method}
                  icon={getChannelVisual(item.base).icon}
                  label={item.label}
                  amount={item.amount}
                  badgeClass={getChannelVisual(item.base).badgeClass}
                  onClick={() => handleTotalCardClick(item.base)}
                />
              )) : (
                <TotalCard icon={<ChannelGlyph base="other" />} label={tx('No channels yet')} amount={0} badgeClass={getChannelVisual('other').badgeClass} onClick={() => handleTotalCardClick('channel_account')} />
              )}
            </div>

            <div className="p-5 border-t border-stone-200/80 dark:border-stone-800/80">
              <ChannelCharts historyData={historyData} distributionData={distributionData} />
            </div>

            <div className="border-t border-stone-200/80 dark:border-stone-800/80 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium text-stone-900 dark:text-stone-100">Accounts</h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Saved accounts & channels. Click one to record an inflow or outflow.</p>
                </div>
                <button
                  onClick={openAddAccount}
                  disabled={!canOperateValue}
                  className="action-btn-secondary text-xs disabled:opacity-50"
                  title="Add Account (A)"
                >
                  <Plus size={13} />
                  Add Account
                </button>
              </div>

              {isAddingAccount && (
                <form onSubmit={handleSaveAccount} className="mb-4 bg-stone-50 dark:bg-stone-800/50 p-4 rounded-lg border border-stone-200 dark:border-stone-700 space-y-3">
                  <p className="text-xs font-semibold text-stone-700 dark:text-stone-300">{editingAccount ? 'Edit Account' : 'New Account'}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      className="control-input"
                      placeholder="Account name (e.g. Main channel account)"
                      value={acctName}
                      onChange={e => setAcctName(e.target.value)}
                      disabled={isSavingAccount}
                      required
                    />
                    <input
                      className="control-input"
                      placeholder="Channel label (e.g. Alpha, Beta, Internal TransferAmount)"
                      value={acctCategory}
                      onChange={e => setAcctCategory(e.target.value)}
                      disabled={isSavingAccount}
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setIsAddingAccount(false); setEditingAccount(null); }} disabled={isSavingAccount} className="action-btn-tertiary px-3 py-1.5 text-xs">Cancel</button>
                    <button type="submit" disabled={!canOperateValue || isSavingAccount} className="px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-xs hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-70">
                      {isSavingAccount ? 'Saving…' : accountSaveState === 'saved' ? 'Saved ✓' : editingAccount ? 'Update' : 'Save'}
                    </button>
                  </div>
                </form>
              )}

              {transferAccounts.length === 0 && channelCardData.length === 0 && !isAddingAccount ? (
                <EmptyState
                  title="No accounts yet"
                  description="Add your first account to start tracking records."
                  actionLabel="Add Account"
                  onAction={openAddAccount}
                  className="py-6"
                />
              ) : (
                <div className="flex flex-wrap gap-3">
                  {transferAccounts.map(acct => (
                    <div
                      key={acct.id}
                      className={cn(
                        'group relative flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                        acct.is_active
                          ? 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 hover:shadow-sm'
                          : 'border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/40 opacity-50'
                      )}
                      onClick={() => {
                        if (!canOperateValue || !acct.is_active) return;
                        setTransMethodBase(acct.category);
                        setTransAccountLabel(acct.name);
                        setIsAddingActivityRecord(true);
                        recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      <span className={cn('shrink-0 p-1.5 rounded-md', getChannelVisual(acct.category).badgeClass)}>{getChannelVisual(acct.category).icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{acct.name}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">{baseMethodLabel(acct.category)}</p>
                      </div>
                      {/* Edit / delete revealed on hover */}
                      <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-0.5" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openEditAccount(acct)}
                          disabled={!canOperateValue}
                          className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 disabled:opacity-50"
                          title="Edit"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAccount(acct.id)}
                          disabled={!canOperateValue || deletingAccountId === acct.id}
                          className="p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div ref={recordHistoryRef} className="section-card p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-medium text-stone-900 dark:text-stone-100">Activity</h3>
                <p className="hidden md:block text-xs text-stone-500 dark:text-stone-400 mt-1">
                  <span className="font-mono text-stone-900 dark:text-stone-100">{formatValue(totalChannel)}</span> · {filteredActiveChannelEntries.length} records
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {canOperateValue && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setTransType('increment'); setIsAddingActivityRecord(true); recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                      title="ActivityRecord Inflow (I)"
                    >
                      <Plus size={13} />
                      ActivityRecord Inflow
                    </button>
                    <button
                      type="button"
                      onClick={() => { setTransType('decrement'); setIsAddingActivityRecord(true); recordHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 px-2.5 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
                      title="ActivityRecord Outflow (O)"
                    >
                      <ArrowDownLeft size={13} />
                      ActivityRecord Outflow
                    </button>
                  </>
                )}
                <DataActionMenu
                  className="text-xs"
                  items={[

                    {
                      key: 'transfer-internal-channel',
                      label: 'Internal -> Channel',
                      onClick: () => {
                        setIsTransferringToChannel(true);
                        if (!transferFromMethod && p2pChannelOptions.length > 0) {
                          setTransferFromMethod(p2pChannelOptions[0].method);
                        }
                      },
                      disabled: !canOperateValue || p2pChannelOptions.length === 0,
                    },
                  ]}
                />
              </div>
            </div>

            <div className="mb-4 pt-3 border-t border-stone-200/80 dark:border-stone-800/80">
              <button
                type="button"
                onClick={() => setIsTxControlsVisible(v => !v)}
                className="action-btn-secondary text-xs mb-3"
                title="Toggle Filters (F)"
              >
                {isTxControlsVisible ? 'Hide Filters' : 'Filters'}
              </button>
              {isTxControlsVisible && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      className="control-input"
                      placeholder="Search account/date"
                      value={orgSearchQuery}
                      onChange={event => setOrgSearchQuery(event.target.value)}
                    />
                    <select
                      className="control-input"
                      value={orgTypeFilter}
                      onChange={event => setOrgTypeFilter(event.target.value as typeof orgTypeFilter)}
                    >
                      <option value="all">All types</option>
                      <option value="increment">Inflow</option>
                      <option value="decrement">Outflow</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input type="date" className="control-input" value={orgDateStart} onChange={event => setOrgDateStart(event.target.value)} />
                    <input type="date" className="control-input" value={orgDateEnd} onChange={event => setOrgDateEnd(event.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleArchiveChannelByDateRange}
                      disabled={!canOperateValue}
                      className="action-btn-secondary text-xs disabled:opacity-50"
                    >
                      Archive by Date Range
                    </button>
                    <button
                      type="button"
                      onClick={handleArchiveOldChannelActivityRecords}
                      disabled={!canOperateValue}
                      className="action-btn-secondary text-xs disabled:opacity-50"
                    >
                      Archive Old ({retentionDaysNumber}+d)
                    </button>
                    <button
                      type="button"
                      onClick={handleRestoreAllArchivedChannelActivityRecords}
                      disabled={!canOperateValue || archivedChannelActivityRecordIds.length === 0}
                      className="action-btn-secondary text-xs disabled:opacity-50"
                    >
                      Restore All Archived
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center">
                    <input
                      type="number"
                      min="1"
                      className="control-input"
                      placeholder="Retention days"
                      value={retentionDays}
                      onChange={event => setRetentionDays(event.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setAutoArchiveEnabled(value => !value)}
                      disabled={!canOperateValue}
                      className="action-btn-secondary text-xs disabled:opacity-50"
                    >
                      {autoArchiveEnabled ? 'Auto-Archive: On' : 'Auto-Archive: Off'}
                    </button>
                    <span className="text-xs text-stone-500 dark:text-stone-400">Older than {retentionDaysNumber} days</span>
                  </div>
                </div>
              </div>
              )}
            </div>

            {isAddingActivityRecord && (
              <form onSubmit={handleAddActivityRecord} className="mb-6 pt-4 border-t border-stone-200/80 dark:border-stone-800/80">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <select 
                    className="control-input"
                    value={transType}
                    onChange={e => setTransType(e.target.value as any)}
                    disabled={!canOperateValue || isSavingActivityRecord}
                  >
                    <option value="increment">{tx('ActivityRecord Inflow')} (+)</option>
                    <option value="decrement">{tx('ActivityRecord Outflow')} (-)</option>
                  </select>
                  <select 
                    className="control-input"
                    value={transMethodBase}
                    onChange={e => {
                      const val = e.target.value;
                      setTransMethodBase(val);
                      if (val !== '__custom__') setTransMethodCustom('');
                      // If a saved account is selected, auto-fill label
                      const savedAcct = transferAccounts.find(a => `saved::${a.id}` === val);
                      if (savedAcct) {
                        setTransAccountLabel(savedAcct.name);
                        setTransMethodBase(savedAcct.category);
                        setTransMethodCustom('');
                      }
                    }}
                    disabled={!canOperateValue || isSavingActivityRecord}
                  >
                    {transferAccounts.filter(a => a.is_active).length > 0 && (
                      <optgroup label="Saved Accounts">
                        {transferAccounts.filter(a => a.is_active).map(a => (
                          <option key={a.id} value={`saved::${a.id}`}>{a.name}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Manual Channel">
                      {availableChannelCategories.map(category => (
                        <option key={category.value} value={category.value}>{category.label}</option>
                      ))}
                      <option value="__custom__">+ New channel label…</option>
                    </optgroup>
                  </select>
                  {transMethodBase === '__custom__' && (
                    <input
                      className="control-input"
                      placeholder="Channel label (e.g. Alpha, Beta, Internal TransferAmount)"
                      value={transMethodCustom}
                      onChange={e => setTransMethodCustom(e.target.value)}
                      disabled={!canOperateValue || isSavingActivityRecord}
                      required
                    />
                  )}
                  <input
                    className="control-input"
                    placeholder="Account name (optional)"
                    value={transAccountLabel}
                    onChange={e => setTransAccountLabel(e.target.value)}
                    disabled={!canOperateValue || isSavingActivityRecord}
                  />
                  <div className="flex items-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 overflow-hidden focus-within:ring-2 focus-within:ring-stone-500">
                    <input 
                      type="number" 
                      className="w-full bg-transparent border-0 px-3 py-2.5 text-stone-900 dark:text-stone-100 focus:outline-none" 
                      placeholder="Value" 
                      value={transAmount} 
                      onChange={e => setTransAmount(e.target.value)} 
                      disabled={!canOperateValue || isSavingActivityRecord}
                      required 
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button 
                    type="button" 
                    onClick={() => setIsAddingActivityRecord(false)}
                    disabled={isSavingActivityRecord}
                    className="action-btn-tertiary px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={!canOperateValue || isSavingActivityRecord}
                    className="px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-xs hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSavingActivityRecord ? tx('Saving…') : recordSaveState === 'saved' ? tx('Saved ✓') : tx('Save ActivityRecord')}
                  </button>
                </div>
                {isSavingActivityRecord && (
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-stone-900 dark:bg-stone-100 transition-all duration-150"
                        style={{ width: `${saveActivityRecordProgress}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">{tx('Saving record…')} {Math.max(8, Math.round(saveActivityRecordProgress))}%</div>
                  </div>
                )}
              </form>
            )}

            {isTransferringToChannel && (
              <form onSubmit={handleTransferInternalToChannel} className="mb-6 pt-4 border-t border-stone-200/80 dark:border-stone-800/80 space-y-3">
                <div className="text-xs text-stone-500 dark:text-stone-400">Move values from transfer channel to account</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    list="p2p-source-account-suggestions"
                    className="control-input"
                    placeholder="From TransferAmount Channel (type to search)"
                    value={transferFromQuery}
                    onChange={e => {
                      const nextValue = e.target.value;
                      setTransferFromQuery(nextValue);
                      const exactMatch = p2pChannelOptions.find(
                        item => p2pOptionDisplay(item.method, item.amount).toLowerCase() === nextValue.trim().toLowerCase()
                      );
                      setTransferFromMethod(exactMatch?.method || '');
                    }}
                    disabled={!canOperateValue || isSavingTransfer}
                    required
                  />
                  <datalist id="p2p-source-account-suggestions">
                    {p2pChannelOptions.map(item => (
                      <option key={item.method} value={p2pOptionDisplay(item.method, item.amount)} />
                    ))}
                  </datalist>
                  <input
                    list="bank-account-label-suggestions"
                    className="control-input"
                    placeholder="To Account Label (optional)"
                    value={transferToChannelLabel}
                    onChange={e => setTransferToChannelLabel(e.target.value)}
                    disabled={!canOperateValue || isSavingTransfer}
                  />
                  <datalist id="channel-label-suggestions">
                    {channelLabelSuggestions.map(label => (
                      <option key={label} value={label} />
                    ))}
                  </datalist>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="control-input"
                    placeholder="Amount"
                    value={transferAmount}
                    onChange={e => settransferAmount(e.target.value)}
                    disabled={!canOperateValue || isSavingTransfer}
                    required
                  />
                </div>

                {!transferFromMethod && transferFromQuery.trim() && (
                  <div className="text-xs text-stone-500 dark:text-stone-400">
                    Select a suggested account to continue.
                  </div>
                )}

                {transferFromMethod && Number.isFinite(parseFloat(transferAmount)) && parseFloat(transferAmount) > (channelTotals[transferFromMethod] || 0) && (
                  <div className="text-xs text-red-600 dark:text-red-400">
                    Insufficient channel total for this transfer.
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTransferringToChannel(false)}
                    disabled={isSavingTransfer}
                    className="action-btn-tertiary px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canOperateValue || isSavingTransfer || !transferFromMethod || (Number.isFinite(parseFloat(transferAmount)) && parseFloat(transferAmount) > (channelTotals[transferFromMethod] || 0))}
                    className="px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-xs hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSavingTransfer ? 'Transferring…' : transferSaveState === 'saved' ? 'Transferred ✓' : 'TransferAmount to Account'}
                  </button>
                </div>

                {isSavingTransfer && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-stone-900 dark:bg-stone-100 transition-all duration-150"
                        style={{ width: `${saveTransferProgress}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">Processing transfer… {Math.max(8, Math.round(saveTransferProgress))}%</div>
                  </div>
                )}
              </form>
            )}

            <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
              {filteredActiveChannelEntries.map(t => (
                <MobileActivityRecordCard
                  key={t.id}
                  title={<span className="text-xs text-stone-500 dark:text-stone-400 font-normal">{formatDate(t.date)}</span>}
                  right={(
                    <p className={cn(
                      "font-mono font-medium text-sm",
                      t.type === 'increment' ? "amount-positive" : "amount-negative"
                    )}>
                      {t.type === 'increment' ? '+' : '-'}{formatValue(t.amount)}
                    </p>
                  )}
                  meta={(
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      {isTransferActivityRecord(t) && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          TransferAmount
                        </span>
                      )}
                      <span>{t.type === 'increment' ? 'Inflow' : 'Outflow'} • {formatMethodLabel(t.method)}</span>
                    </span>
                  )}
                >
                  <div className="mt-2 flex justify-end gap-2">
                    {canOperateValue && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleArchiveChannelActivityRecord(t.id)}
                          className="action-btn-tertiary px-2.5 py-1 text-xs"
                        >
                          Archive
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleDeleteChannelActivityRecord(t.id); }}
                          disabled={deletingChannelActivityRecordId === t.id}
                          className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                        >
                          {deletingChannelActivityRecordId === t.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </MobileActivityRecordCard>
              ))}
              {filteredActiveChannelEntries.length === 0 && (
                <div className="px-6 py-8 text-center text-stone-400 text-sm">No records recorded.</div>
              )}
            </div>

            {archivedChannelEntries.length > 0 && (
              <div className="mt-4 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/40 p-3 md:hidden">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Archived ActivityRecords</h4>
                  <button
                    type="button"
                    onClick={() => setIsArchivedActivityRecordsExpanded(prev => !prev)}
                    className="action-btn-secondary px-2.5 py-1 text-xs"
                  >
                    {isArchivedActivityRecordsExpanded ? 'Hide' : `Show (${filteredArchivedChannelEntries.length})`}
                  </button>
                </div>
                {isArchivedActivityRecordsExpanded && (
                  <div className="mt-3 divide-y divide-stone-100 dark:divide-stone-800">
                    {filteredArchivedChannelEntries.map(t => (
                      <MobileActivityRecordCard
                        key={t.id}
                        title={<span className="text-xs text-stone-500 dark:text-stone-400 font-normal">{formatDate(t.date)}</span>}
                        right={(
                          <p className={cn(
                            "font-mono font-medium text-sm",
                            t.type === 'increment' ? "amount-positive" : "amount-negative"
                          )}>
                            {t.type === 'increment' ? '+' : '-'}{formatValue(t.amount)}
                          </p>
                        )}
                        meta={<span className="capitalize">{t.type} • {formatMethodLabel(t.method)}</span>}
                      >
                        <div className="mt-2 flex justify-end gap-2">
                          {canOperateValue && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUnarchiveChannelActivityRecord(t.id)}
                                className="action-btn-tertiary px-2.5 py-1 text-xs"
                              >
                                Unarchive
                              </button>
                              <button
                                type="button"
                                onClick={() => { void handleDeleteChannelActivityRecord(t.id); }}
                                disabled={deletingChannelActivityRecordId === t.id}
                                className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                              >
                                {deletingChannelActivityRecordId === t.id ? 'Deleting…' : 'Delete'}
                              </button>
                            </>
                          )}
                        </div>
                      </MobileActivityRecordCard>
                    ))}
                  </div>
                )}
              </div>
            )}

            <CollapsibleActivitySection
              title="Activity"
              summary={`${filteredActiveChannelEntries.length} records`}
              className="hidden md:block"
              defaultExpanded={false}
              maxExpandedHeightClass="max-h-[560px]"
              maxCollapsedHeightClass="max-h-[96px]"
              contentClassName="bg-white dark:bg-stone-900"
            >
              <table className="desktop-grid desktop-sticky-first desktop-sticky-last w-full min-w-[900px] activity-fixed bg-white dark:bg-stone-900 text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                  <tr>
                    <th className="sticky-col px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Date</th>
                    <th className="px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Type</th>
                    <th className="px-6 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Channel</th>
                    <th className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Account</th>
                    <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Amount</th>
                    <th className="sticky-col-right px-6 py-2.5 w-[170px] text-right text-[11px] font-semibold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white dark:divide-stone-800 dark:bg-stone-900">
                  {filteredActiveChannelEntries.map(t => (
                    <tr key={t.id} className={cn(
                      "hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors",
                      isTransferActivityRecord(t)
                        ? "bg-blue-50/60 dark:bg-blue-900/10"
                        : "odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60"
                    )}>
                      <td className="sticky-col px-6 py-2.5 text-stone-500 dark:text-stone-400">{formatDate(t.date)}</td>
                      <td className="px-6 py-2.5">
                        <div className="inline-flex items-center gap-1.5">
                          {isTransferActivityRecord(t) && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                              TransferAmount
                            </span>
                          )}
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                            t.type === 'increment' 
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" 
                              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          )}>
                            {t.type === 'increment' ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
                            {t.type === 'increment' ? 'Inflow' : 'Outflow'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-2.5 text-stone-900 dark:text-stone-100">{formatMethodLabel(t.method)}</td>
                      <td className="px-6 py-2.5 text-stone-500 dark:text-stone-400">
                      </td>
                      <td className={cn(
                        "px-6 py-2.5 text-right font-mono font-medium",
                        t.type === 'increment' ? "amount-positive" : "amount-negative"
                      )}>
                        {t.type === 'increment' ? '+' : '-'}{formatValue(t.amount)}
                      </td>
                      <td className="sticky-col-right px-6 py-2.5 text-right">
                        {canOperateValue && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleArchiveChannelActivityRecord(t.id)}
                              className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5"
                              title="Archive ActivityRecord"
                            >
                              Archive
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handleDeleteChannelActivityRecord(t.id); }}
                              disabled={deletingChannelActivityRecordId === t.id}
                              className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={deletingChannelActivityRecordId === t.id ? 'Deleting…' : 'Delete ActivityRecord'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredActiveChannelEntries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-stone-400">
                        No records recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CollapsibleActivitySection>

            {archivedChannelEntries.length > 0 && (
              <div className="hidden md:block mt-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setIsArchivedActivityRecordsExpanded(prev => !prev)}
                    className="action-btn-secondary text-xs px-2.5 py-1.5"
                  >
                    {isArchivedActivityRecordsExpanded ? 'Hide' : `Show (${filteredArchivedChannelEntries.length})`}
                  </button>
                </div>
                {isArchivedActivityRecordsExpanded && (
                  <CollapsibleActivitySection
                    title="Archived Activity"
                    summary={`${archivedChannelEntries.length} records`}
                    defaultExpanded={false}
                    maxExpandedHeightClass="max-h-[420px]"
                    maxCollapsedHeightClass="max-h-[96px]"
                    contentClassName="bg-white dark:bg-stone-900"
                  >
                    <table className="desktop-grid desktop-sticky-first desktop-sticky-last w-full min-w-[900px] activity-fixed bg-white dark:bg-stone-900 text-left text-[13px]">
                      <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                        <tr>
                          <th className="sticky-col px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Date</th>
                          <th className="px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Type</th>
                          <th className="px-6 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Channel</th>
                          <th className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-wide">Account</th>
                          <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Amount</th>
                          <th className="sticky-col-right px-6 py-2.5 w-[170px] text-right text-[11px] font-semibold uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 bg-white dark:divide-stone-800 dark:bg-stone-900">
                        {filteredArchivedChannelEntries.map(t => (
                          <tr key={t.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                            <td className="sticky-col px-6 py-2.5 text-stone-500 dark:text-stone-400">{formatDate(t.date)}</td>
                            <td className="px-6 py-2.5">{t.type === 'increment' ? 'Inflow' : 'Outflow'}</td>
                            <td className="px-6 py-2.5 text-stone-900 dark:text-stone-100">{formatMethodLabel(t.method)}</td>
                            <td className="px-6 py-2.5 text-stone-500 dark:text-stone-400">
                            </td>
                            <td className={cn(
                              "px-6 py-2.5 text-right font-mono font-medium",
                              t.type === 'increment' ? "amount-positive" : "amount-negative"
                            )}>
                              {t.type === 'increment' ? '+' : '-'}{formatValue(t.amount)}
                            </td>
                            <td className="sticky-col-right px-6 py-2.5 text-right">
                              {canOperateValue && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleUnarchiveChannelActivityRecord(t.id)}
                                    className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5"
                                  >
                                    Unarchive
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { void handleDeleteChannelActivityRecord(t.id); }}
                                    disabled={deletingChannelActivityRecordId === t.id}
                                    className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={deletingChannelActivityRecordId === t.id ? 'Deleting…' : 'Delete ActivityRecord'}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                        {filteredArchivedChannelEntries.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-stone-400">No archived records match current filters.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CollapsibleActivitySection>
                )}
              </div>
            )}

          </div>

        <div className="section-card p-4">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-medium text-stone-900 dark:text-stone-100">Deferred Tracking</h3>
                <p className="text-sm text-stone-500 dark:text-stone-400"><span className="font-mono text-stone-900 dark:text-stone-100 font-medium">{formatValue(totalOutstanding)}</span> · {filteredActiveAdjustments.length} live · {pendingAdjustmentRequests.length} pending</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <DataActionMenu
                  className="text-xs"
                  items={[

                    {
                      key: 'new-adjustment-transfer',
                      label: 'Add Live ActivityRecord',
                      onClick: () => setIsAddingAdjustment(true),
                      disabled: !canOperateValue,
                    },
                  ]}
                />
              </div>
            </div>

            {(pendingAdjustmentRequests.length > 0 || canOperateValue) && (
              <div className="mb-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/50 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <h4 className="text-sm font-medium text-stone-900 dark:text-stone-100">Pending Deferred Approvals</h4>
                    <p className="text-xs text-stone-500 dark:text-stone-400">Operator-submitted deferred records stay here until admin approves or rejects them.</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                    {pendingAdjustmentRequests.length} pending
                  </span>
                </div>

                {pendingAdjustmentRequests.length === 0 ? (
                  <p className="text-sm text-stone-500 dark:text-stone-400">No pending deferred records.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingAdjustmentRequests.map(request => {
                      const unit = entities.find(item => item.id === request.entity_id);
                      return (
                        <div key={request.id} className="flex flex-col gap-3 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-stone-900 dark:text-stone-100">{unit?.name || 'Unknown'}</span>
                              <span className={cn(
                                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
                                request.type === 'input'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                              )}>
                                {request.type === 'input' ? 'Outflow' : 'Inflow'}
                              </span>
                            </div>
                            <p className="text-xs text-stone-500 dark:text-stone-400">Requested {formatDate(request.requested_at)} · {formatValue(request.amount)}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void handleResolveAdjustment(request.id, 'rejected')}
                              disabled={!canOperateValue}
                              className="action-btn-tertiary px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleResolveAdjustment(request.id, 'approved')}
                              disabled={!canOperateValue}
                              className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="mb-4 pt-3 border-t border-stone-200/80 dark:border-stone-800/80">
              <button
                type="button"
                onClick={() => setIsAdjustmentControlsVisible(v => !v)}
                className="action-btn-secondary text-xs mb-3"
              >
                {isAdjustmentControlsVisible ? 'Hide Filters' : 'Filters'}
              </button>
              {isAdjustmentControlsVisible && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      className="control-input"
                      value={adjustmentSearchQuery}
                      onChange={event => setAdjustmentSearchQuery(event.target.value)}
                    />
                    <select
                      className="control-input"
                      value={adjustmentTypeFilter}
                      onChange={event => setAdjustmentTypeFilter(event.target.value as typeof adjustmentTypeFilter)}
                    >
                      <option value="all">All directions</option>
                      <option value="input">Outflow</option>
                      <option value="output">Inflow</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleArchiveSettledOrOldAdjustments}
                      disabled={!canOperateValue}
                      className="action-btn-secondary text-xs disabled:opacity-50"
                    >
                      Archive Settled/Old Entries
                    </button>
                    <button
                      type="button"
                      onClick={handleRestoreAllArchivedAdjustments}
                      disabled={!canOperateValue || archivedAdjustmentIds.length === 0}
                      className="action-btn-secondary text-xs disabled:opacity-50"
                    >
                      Restore All Archived
                    </button>
                  </div>
                </div>
              </div>
              )}
            </div>

            {isAddingAdjustment && (
              <form onSubmit={handleAddAdjustment} className="mb-6 pt-4 border-t border-stone-200/80 dark:border-stone-800/80">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <select 
                    className="control-input"
                    value={adjustmentUnitId}
                    onChange={e => setAdjustmentUnitId(e.target.value)}
                    disabled={!canOperateValue || isSavingAdjustment}
                    required
                  >
                    <option value="">Select Collaboration...</option>
                    {entities.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select 
                    className="control-input"
                    value={adjustmentType}
                    onChange={e => setAdjustmentType(e.target.value as any)}
                    disabled={!canOperateValue || isSavingAdjustment}
                  >
                    <option value="input">Outflow</option>
                    <option value="output">Inflow</option>
                  </select>
                  <div className="flex items-center rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 overflow-hidden focus-within:ring-2 focus-within:ring-stone-500">
                    <input 
                      type="number" 
                      className="w-full bg-transparent border-0 px-3 py-2.5 text-stone-900 dark:text-stone-100 focus:outline-none" 
                      placeholder="Amount" 
                      value={adjustmentAmount} 
                      onChange={e => setAdjustmentAmount(e.target.value)} 
                      disabled={!canOperateValue || isSavingAdjustment}
                      required 
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button 
                    type="button" 
                    onClick={() => setIsAddingAdjustment(false)}
                    disabled={isSavingAdjustment}
                    className="action-btn-tertiary px-3 py-1.5 text-xs"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={!canOperateValue || isSavingAdjustment}
                    className="px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-xs hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSavingAdjustment ? 'ActivityRecording…' : adjustmentSaveState === 'saved' ? 'ActivityRecorded ✓' : 'ActivityRecord ActivityRecord'}
                  </button>
                </div>
                {isSavingAdjustment && (
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-stone-900 dark:bg-stone-100 transition-all duration-150"
                        style={{ width: `${saveAdjustmentProgress}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">ActivityRecording live deferred record… {Math.max(8, Math.round(saveAdjustmentProgress))}%</div>
                  </div>
                )}
              </form>
            )}

            <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
              {filteredActiveAdjustments.map(l => {
                const unit = entities.find(p => p.id === l.entity_id);
                return (
                  <MobileActivityRecordCard
                    key={l.id}
                    title={unit?.name || 'Unknown'}
                    right={<p className="font-mono text-stone-900 dark:text-stone-100">{formatValue(l.amount)}</p>}
                    meta={formatDate(l.date)}
                  >
                    <p className="text-xs text-stone-500 dark:text-stone-400">{l.type === 'input' ? 'Outflow' : 'Inflow'} · Active</p>
                    {settlingActivityRecordId === l.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 p-2 bg-stone-50 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700">
                        <select
                          className="control-input text-xs flex-1 min-w-[130px]"
                          value={settleAccountBase}
                          onChange={e => {
                            const value = e.target.value;
                            setSettleAccountBase(value);
                            if (value !== '__custom__') setSettleAccountCustom('');
                          }}
                          disabled={isSettlingActivityRecord}
                        >
                          {availableChannelCategories.map(category => (
                            <option key={category.value} value={category.value}>{category.label}</option>
                          ))}
                          <option value="__custom__">+ New channel label…</option>
                        </select>
                        {settleAccountBase === '__custom__' && (
                          <input
                            className="control-input text-xs flex-1 min-w-[150px]"
                            placeholder="Channel label"
                            value={settleAccountCustom}
                            onChange={e => setSettleAccountCustom(e.target.value)}
                            disabled={isSettlingActivityRecord}
                            required
                          />
                        )}
                        <input
                          className="control-input text-xs flex-1 min-w-[110px]"
                          placeholder="Account label (optional)"
                          value={settleAccountLabel}
                          onChange={e => setSettleAccountLabel(e.target.value)}
                          disabled={isSettlingActivityRecord}
                        />
                        <button
                          type="button"
                          onClick={() => void handleSettleActivityRecord(l.id)}
                          disabled={isSettlingActivityRecord}
                          className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {isSettlingActivityRecord ? 'Settling…' : 'Confirm Settle'}
                        </button>
                        <button type="button" onClick={() => setSettlingActivityRecordId(null)} disabled={isSettlingActivityRecord} className="action-btn-tertiary px-2 py-1 text-xs">Cancel</button>
                      </div>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      {canOperateValue && (
                        <>
                          {settlingActivityRecordId !== l.id && (
                            <button
                              type="button"
                              onClick={() => { setSettlingActivityRecordId(l.id); setSettleAccountBase('channel_account'); setSettleAccountLabel(''); }}
                              className="action-btn-tertiary px-2.5 py-1 text-xs text-emerald-700 dark:text-emerald-400"
                            >
                              Settle ActivityRecord
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleArchiveAdjustment(l.id)}
                            className="action-btn-tertiary px-2.5 py-1 text-xs"
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            onClick={() => { void handleDeleteAdjustment(l.id); }}
                            disabled={deletingAdjustmentId === l.id}
                            className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                          >
                            {deletingAdjustmentId === l.id ? 'Removing…' : 'Remove'}
                          </button>
                        </>
                      )}
                    </div>
                  </MobileActivityRecordCard>
                );
              })}
              {filteredActiveAdjustments.length === 0 && (
                <div className="px-6 py-8 text-center text-stone-400 text-sm">No deferred records yet.</div>
              )}
            </div>

            {archivedAdjustments.length > 0 && (
              <div className="mt-4 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/40 p-3 md:hidden">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIsArchivedAdjustmentsExpanded(prev => !prev)}
                    className="action-btn-secondary px-2.5 py-1 text-xs"
                  >
                    {isArchivedAdjustmentsExpanded ? 'Hide' : `Show (${filteredArchivedAdjustments.length})`}
                  </button>
                </div>
                {isArchivedAdjustmentsExpanded && (
                  <div className="mt-3 divide-y divide-stone-100 dark:divide-stone-800">
                    {filteredArchivedAdjustments.map(l => {
                      const unit = entities.find(p => p.id === l.entity_id);
                      return (
                        <MobileActivityRecordCard
                          key={l.id}
                          title={unit?.name || 'Unknown'}
                          right={<p className="font-mono text-stone-900 dark:text-stone-100">{formatValue(l.amount)}</p>}
                          meta={formatDate(l.date)}
                        >
                          <p className="text-xs text-stone-500 dark:text-stone-400">{l.type === 'input' ? 'Outflow' : 'Inflow'} · Settled</p>
                          <div className="mt-2 flex justify-end gap-2">
                            {canOperateValue && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleUnarchiveAdjustment(l.id)}
                                  className="action-btn-tertiary px-2.5 py-1 text-xs"
                                >
                                  Unarchive
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { void handleDeleteAdjustment(l.id); }}
                                  disabled={deletingAdjustmentId === l.id}
                                  className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                                >
                                  {deletingAdjustmentId === l.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </>
                            )}
                          </div>
                        </MobileActivityRecordCard>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <CollapsibleActivitySection
              title="Deferred Tracking"
              summary={`${filteredActiveAdjustments.length} records`}
              className="hidden md:block"
              defaultExpanded={false}
              maxExpandedHeightClass="max-h-[560px]"
              maxCollapsedHeightClass="max-h-[96px]"
            >
              <table className="desktop-grid desktop-sticky-first desktop-sticky-last w-full min-w-[900px] activity-fixed text-left text-[13px]">
                <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                  <tr>
                    <th className="sticky-col px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Date</th>
                    <th className="px-6 py-2.5 w-[220px] text-[11px] font-semibold uppercase tracking-wide">Contact</th>
                    <th className="px-6 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Direction</th>
                    <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Amount</th>
                    <th className="sticky-col-right px-6 py-2.5 w-[170px] text-right text-[11px] font-semibold uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                  {filteredActiveAdjustments.map(l => {
                    const unit = entities.find(p => p.id === l.entity_id);
                    return (
                      <tr key={l.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                        <td className="sticky-col px-6 py-2.5 text-stone-500 dark:text-stone-400">{formatDate(l.date)}</td>
                        <td className="px-6 py-2.5 font-medium text-stone-900 dark:text-stone-100">{unit?.name || 'Unknown'}</td>
                        <td className="px-6 py-2.5">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                            l.type === 'input' 
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" 
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                          )}>
                            {l.type === 'input' ? 'Outflow' : 'Inflow'}
                          </span>
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono font-medium text-stone-900 dark:text-stone-100">{formatValue(l.amount)}</td>
                        <td className="sticky-col-right px-6 py-2.5 text-right">
                          {settlingActivityRecordId === l.id ? (
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              <select
                                className="control-input text-xs w-[130px]"
                                value={settleAccountBase}
                                onChange={e => {
                                  const value = e.target.value;
                                  setSettleAccountBase(value);
                                  if (value !== '__custom__') setSettleAccountCustom('');
                                }}
                                disabled={isSettlingActivityRecord}
                              >
                                {availableChannelCategories.map(category => (
                                  <option key={category.value} value={category.value}>{category.label}</option>
                                ))}
                                <option value="__custom__">+ New channel label…</option>
                              </select>
                              {settleAccountBase === '__custom__' && (
                                <input
                                  className="control-input text-xs w-[140px]"
                                  placeholder="Channel label"
                                  value={settleAccountCustom}
                                  onChange={e => setSettleAccountCustom(e.target.value)}
                                  disabled={isSettlingActivityRecord}
                                  required
                                />
                              )}
                              <input
                                className="control-input text-xs w-[110px]"
                                placeholder="Label (opt.)"
                                value={settleAccountLabel}
                                onChange={e => setSettleAccountLabel(e.target.value)}
                                disabled={isSettlingActivityRecord}
                              />
                              <button
                                type="button"
                                onClick={() => void handleSettleActivityRecord(l.id)}
                                disabled={isSettlingActivityRecord}
                                className="px-2 py-1 text-[11px] bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {isSettlingActivityRecord ? 'Settling…' : 'Confirm'}
                              </button>
                              <button type="button" onClick={() => setSettlingActivityRecordId(null)} disabled={isSettlingActivityRecord} className="action-btn-tertiary px-2 py-1 text-[11px]">Cancel</button>
                            </div>
                          ) : (
                            <>
                              {canOperateValue && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => { setSettlingActivityRecordId(l.id); setSettleAccountBase('channel_account'); setSettleAccountLabel(''); }}
                                    className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5 text-emerald-700 dark:text-emerald-400"
                                  >
                                    Settle ActivityRecord
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleArchiveAdjustment(l.id)}
                                    className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5"
                                  >
                                    Archive
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { void handleDeleteAdjustment(l.id); }}
                                    disabled={deletingAdjustmentId === l.id}
                                    className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={deletingAdjustmentId === l.id ? 'Removing…' : 'Remove ActivityRecord'}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredActiveAdjustments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-stone-400">
                        No deferred records yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CollapsibleActivitySection>

            {archivedAdjustments.length > 0 && (
              <div className="hidden md:block mt-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setIsArchivedAdjustmentsExpanded(prev => !prev)}
                    className="action-btn-secondary text-xs px-2.5 py-1.5"
                  >
                    {isArchivedAdjustmentsExpanded ? 'Hide' : `Show (${filteredArchivedAdjustments.length})`}
                  </button>
                </div>
                {isArchivedAdjustmentsExpanded && (
                  <CollapsibleActivitySection
                    title="Archived Deferred"
                    summary={`${filteredArchivedAdjustments.length} records`}
                    defaultExpanded={false}
                    maxExpandedHeightClass="max-h-[420px]"
                    maxCollapsedHeightClass="max-h-[96px]"
                  >
                    <table className="desktop-grid desktop-sticky-first desktop-sticky-last w-full min-w-[900px] activity-fixed text-left text-[13px]">
                      <thead className="sticky top-0 z-10 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                        <tr>
                          <th className="sticky-col px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Date</th>
                          <th className="px-6 py-2.5 w-[220px] text-[11px] font-semibold uppercase tracking-wide">User</th>
                          <th className="px-6 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Action</th>
                          <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Amount</th>
                          <th className="sticky-col-right px-6 py-2.5 w-[170px] text-right text-[11px] font-semibold uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                        {filteredArchivedAdjustments.map(l => {
                          const unit = entities.find(p => p.id === l.entity_id);
                          return (
                            <tr key={l.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                              <td className="sticky-col px-6 py-2.5 text-stone-500 dark:text-stone-400">{formatDate(l.date)}</td>
                              <td className="px-6 py-2.5 font-medium text-stone-900 dark:text-stone-100">{unit?.name || 'Unknown'}</td>
                              <td className="px-6 py-2.5 capitalize">{l.type === 'input' ? 'Outflow' : 'Inflow'} · Settled</td>
                              <td className="px-6 py-2.5 text-right font-mono font-medium text-stone-900 dark:text-stone-100">{formatValue(l.amount)}</td>
                              <td className="sticky-col-right px-6 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleUnarchiveAdjustment(l.id)}
                                  disabled={!canOperateValue}
                                  className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5 disabled:opacity-50"
                                >
                                  Unarchive
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { if (canOperateValue) void handleDeleteAdjustment(l.id); }}
                                  disabled={!canOperateValue || deletingAdjustmentId === l.id}
                                  className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={deletingAdjustmentId === l.id ? 'Deleting…' : 'Delete ActivityRecord'}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredArchivedAdjustments.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-stone-400">No archived deferred records.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CollapsibleActivitySection>
                )}
              </div>
            )}
        </div>

      </div>

    </div>
  );
}

function TotalCard({ icon, label, amount, badgeClass, onClick }: { icon: React.ReactNode, label: string, amount: number, badgeClass: string, onClick?: () => void }) {
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
