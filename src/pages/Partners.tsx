import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { UserPlus, Plus, DollarSign, ArrowUpRight, ArrowDownLeft, Briefcase, Search, Filter, Download, Trash2 } from 'lucide-react';
import { formatValue, formatDate } from '../lib/utils';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import MobileRecordCard from '../components/MobileRecordCard';
import CollapsibleWorkspaceSection from '../components/CollapsibleWorkspaceSection';
import { useAppRole } from '../context/AppRoleContext';
import { useNotification } from '../context/NotificationContext';
import { useLabels } from '../lib/labels';

const PARTNER_CONTACT_METHOD_LABELS = {
  none: 'No contact',
  internal: 'Internal reference',
  email: 'Email',
  telegram: 'Telegram',
  signal: 'Signal',
  whatsapp: 'WhatsApp',
} as const;

const getPartnerDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'Unnamed Partner';
};

const getPartnerContactDisplay = (contactMethod?: string | null, contactValue?: string | null) => {
  const normalizedMethod = typeof contactMethod === 'string' ? contactMethod : 'none';
  const trimmedValue = contactValue?.trim();
  if (!trimmedValue) return PARTNER_CONTACT_METHOD_LABELS.none;
  const methodLabel = PARTNER_CONTACT_METHOD_LABELS[normalizedMethod as keyof typeof PARTNER_CONTACT_METHOD_LABELS] ?? 'Contact';
  return `${methodLabel}: ${trimmedValue}`;
};

const getPartnerRoleLabel = (role?: string | null) => {
  switch (role) {
    case 'partner': return 'Referral (Client-focused)';
    case 'channel': return 'Channel (Solvency-focused)';
    case 'hybrid': return 'Hybrid (Referral + Solvency)';
    case 'both': return 'Hybrid';
    case 'promoter': return 'Referral';
    case 'operator':
    case 'viewer':
      return 'Channel';
    default: return 'Referral';
  }
};

export default function PartnersPage({ embedded = false }: { embedded?: boolean }) {
  const { partners, partnerEntries, addPartner, deletePartner, addPartnerEntry, deletePartnerEntry, updatePartner, units, workspaces, entries, recordSystemEvent } = useData();
  const { canManageValue } = useAppRole();
  const { notify } = useNotification();
  const { tx } = useLabels();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'entrys'>('list');
  const [deletingPartnerId, setDeletingPartnerId] = useState<string | null>(null);
  const [deletingPartnerEntryId, setDeletingPartnerEntryId] = useState<string | null>(null);
  const [archivedPartnerEntryIds, setArchivedPartnerEntryIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('partners.archived_entry_ids');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      return [];
    }
  });
  const [isArchivedPartnerListExpanded, setIsArchivedPartnerListExpanded] = useState(false);
  const [isArchivedPartnerEntrysExpanded, setIsArchivedPartnerEntrysExpanded] = useState(false);
  const [entrySearchQuery, setEntrySearchQuery] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<'all' | 'input' | 'alignment' | 'output' | 'adjustment'>('all');
  const [entryDateStart, setEntryDateStart] = useState('');
  const [entryDateEnd, setEntryDateEnd] = useState('');
  const [retentionDays, setRetentionDays] = useState(() => {
    if (typeof window === 'undefined') return '90';
    return window.localStorage.getItem('partners.retentionDays') || '90';
  });
  const [autoArchiveEnabled, setAutoArchiveEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('partners.autoArchiveEnabled') === 'true';
  });

  // New Partner Form
  const [name, setName] = useState('');
  const [role, setRole] = useState<'channel' | 'partner' | 'hybrid'>('channel');
  const [contactMethod, setContactMethod] = useState<'none' | 'internal' | 'email' | 'telegram' | 'signal' | 'whatsapp'>('none');
  const [contactValue, setContactValue] = useState('');
  const [newPartnerArrangementRate, setNewPartnerArrangementRate] = useState('0');
  const [newSystemAllocationPercent, setNewSystemAllocationPercent] = useState('0');

  // Entry Form
  const [transType, setTransType] = useState<'input' | 'alignment' | 'output' | 'adjustment'>('input');
  const [transAmount, setTransAmount] = useState('');
  const [editPartnerArrangementRate, setEditPartnerArrangementRate] = useState('0');
  const [editSystemAllocationPercent, setEditSystemAllocationPercent] = useState('0');
  const [alignmentStartDate, setAlignmentStartDate] = useState('');
  const [alignmentEndDate, setAlignmentEndDate] = useState('');

  const parseNonNegativeNumber = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageValue) return;
    try {
      await addPartner({
        name,
        role: role as any,
        contact_method: contactMethod,
        contact_value: contactValue.trim() || undefined,
        partner_arrangement_rate: parseNonNegativeNumber(newPartnerArrangementRate),
        system_allocation_percent: parseNonNegativeNumber(newSystemAllocationPercent),
        total: 0,
        status: 'active'
      });
      setIsAdding(false);
      setName('');
      setContactMethod('none');
      setContactValue('');
      setNewPartnerArrangementRate('0');
      setNewSystemAllocationPercent('0');
      notify({ type: 'success', message: 'Partner saved.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to save partner.' });
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageValue) return;
    if (!selectedPartnerId) return;
    const today = new Date().toISOString().split('T')[0];

    try {
      await addPartnerEntry({
        partner_id: selectedPartnerId,
        type: transType as any,
        amount: parseFloat(transAmount),
        date: today
      });
      setTransAmount('');
      notify({ type: 'success', message: 'Entry recorded.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to log entry.' });
    }
  };

  const handleDeletePartner = async (partnerId: string) => {
    if (!canManageValue || deletingPartnerId === partnerId) return;
    const confirmed = window.confirm('Remove this partner? This is only allowed when no linked units or entries exist.');
    if (!confirmed) return;

    try {
      setDeletingPartnerId(partnerId);
      await deletePartner(partnerId);
      if (selectedPartnerId === partnerId) {
        setSelectedPartnerId(null);
      }
      notify({ type: 'success', message: 'Partner removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove partner.' });
    } finally {
      setDeletingPartnerId(current => (current === partnerId ? null : current));
    }
  };

  const handleArchivePartner = async (partnerId: string) => {
    if (!canManageValue) return;
    const partner = partners.find(item => item.id === partnerId);
    if (!partner || partner.status === 'inactive') return;

    try {
      await updatePartner({ ...partner, status: 'inactive' });
      if (selectedPartnerId === partnerId) {
        setSelectedPartnerId(null);
      }
      void (recordSystemEvent as any)({ 
        action: 'partner_archived',
        entity: 'partner',
        entity_id: partnerId,
        details: `Partner ${getPartnerDisplayName(partner.name)} hidden`,
      });
      notify({ type: 'success', message: 'Partner hidden.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to hide partner.' });
    }
  };

  const handleUnarchivePartner = async (partnerId: string) => {
    if (!canManageValue) return;
    const partner = partners.find(item => item.id === partnerId);
    if (!partner || partner.status !== 'inactive') return;

    try {
      await updatePartner({ ...partner, status: 'active' });
      void (recordSystemEvent as any)({ 
        action: 'partner_unarchived',
        entity: 'partner',
        entity_id: partnerId,
        details: `Partner ${getPartnerDisplayName(partner.name)} restored`,
      });
      notify({ type: 'success', message: 'Partner restored.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to restore partner.' });
    }
  };

  const handleDeletePartnerEntry = async (entryId: string) => {
    if (!canManageValue || deletingPartnerEntryId === entryId) return;
    const confirmed = window.confirm('Remove this entry? This will reverse its total impact.');
    if (!confirmed) return;

    try {
      setDeletingPartnerEntryId(entryId);
      await deletePartnerEntry(entryId);
      notify({ type: 'success', message: 'Entry removed.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to remove entry.' });
    } finally {
      setDeletingPartnerEntryId(current => (current === entryId ? null : current));
    }
  };

  const handleArchivePartnerEntry = (entryId: string) => {
    setArchivedPartnerEntryIds(current => (current.includes(entryId) ? current : [...current, entryId]));
    void (recordSystemEvent as any)({ 
      action: 'partner_entry_archived',
      entity: 'partner_entry',
      entity_id: entryId,
      details: 'Entry moved to hidden list',
    });
    notify({ type: 'success', message: 'Entry hidden.' });
  };

  const handleUnarchivePartnerEntry = (entryId: string) => {
    setArchivedPartnerEntryIds(current => current.filter(item => item !== entryId));
    void (recordSystemEvent as any)({ 
      action: 'partner_entry_unarchived',
      entity: 'partner_entry',
      entity_id: entryId,
      details: 'Entry restored from hidden list',
    });
    notify({ type: 'success', message: 'Entry restored.' });
  };

  const selectedPartner = partners.find(a => a.id === selectedPartnerId);
  const selectedEntrys = partnerEntries.filter(t => t.partner_id === selectedPartnerId);
  const archivedPartnerEntryIdSet = useMemo(() => new Set(archivedPartnerEntryIds), [archivedPartnerEntryIds]);
  const activeSelectedEntrys = useMemo(
    () => selectedEntrys.filter(entry => !archivedPartnerEntryIdSet.has(entry.id)),
    [selectedEntrys, archivedPartnerEntryIdSet]
  );
  const archivedSelectedEntrys = useMemo(
    () => selectedEntrys.filter(entry => archivedPartnerEntryIdSet.has(entry.id)),
    [selectedEntrys, archivedPartnerEntryIdSet]
  );
  const normalizedEntrySearch = entrySearchQuery.trim().toLowerCase();
  const filteredActiveSelectedEntrys = useMemo(() => activeSelectedEntrys.filter(entry => {
    if (entryTypeFilter !== 'all' && entry.type !== entryTypeFilter) return false;
    if (entryDateStart && entry.date < entryDateStart) return false;
    if (entryDateEnd && entry.date > entryDateEnd) return false;
    if (!normalizedEntrySearch) return true;
    return (
      entry.type.toLowerCase().includes(normalizedEntrySearch) ||
      entry.date.toLowerCase().includes(normalizedEntrySearch)
    );
  }), [activeSelectedEntrys, entryTypeFilter, entryDateStart, entryDateEnd, normalizedEntrySearch]);
  const filteredArchivedSelectedEntrys = useMemo(() => archivedSelectedEntrys.filter(entry => {
    if (entryTypeFilter !== 'all' && entry.type !== entryTypeFilter) return false;
    if (entryDateStart && entry.date < entryDateStart) return false;
    if (entryDateEnd && entry.date > entryDateEnd) return false;
    if (!normalizedEntrySearch) return true;
    return (
      entry.type.toLowerCase().includes(normalizedEntrySearch) ||
      entry.date.toLowerCase().includes(normalizedEntrySearch)
    );
  }), [archivedSelectedEntrys, entryTypeFilter, entryDateStart, entryDateEnd, normalizedEntrySearch]);
  const retentionDaysNumber = useMemo(() => {
    const parsed = Number(retentionDays);
    if (!Number.isFinite(parsed)) return 90;
    return Math.max(1, Math.floor(parsed));
  }, [retentionDays]);
  const oldPartnerEntryIds = useMemo(() => {
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - retentionDaysNumber);
    const thresholdTime = threshold.getTime();
    return partnerEntries
      .filter(entry => !archivedPartnerEntryIdSet.has(entry.id))
      .filter(entry => {
        const date = new Date(entry.date);
        return Number.isFinite(date.getTime()) && date.getTime() < thresholdTime;
      })
      .map(entry => entry.id);
  }, [partnerEntries, archivedPartnerEntryIdSet, retentionDaysNumber]);
  const activePartners = useMemo(() => partners.filter(partner => partner.status !== 'inactive'), [partners]);
  const archivedPartners = useMemo(() => partners.filter(partner => partner.status === 'inactive'), [partners]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('partners.archived_entry_ids', JSON.stringify(archivedPartnerEntryIds));
  }, [archivedPartnerEntryIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('partners.retentionDays', retentionDays);
  }, [retentionDays]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('partners.autoArchiveEnabled', autoArchiveEnabled ? 'true' : 'false');
  }, [autoArchiveEnabled]);

  useEffect(() => {
    if (!autoArchiveEnabled || oldPartnerEntryIds.length === 0) return;
    setArchivedPartnerEntryIds(current => {
      const next = new Set(current);
      oldPartnerEntryIds.forEach(id => next.add(id));
      if (next.size === current.length) return current;
      void (recordSystemEvent as any)({ 
        action: 'partner_entries_auto_archived',
        entity: 'partner_entry',
        amount: oldPartnerEntryIds.length,
        details: `Auto-hidden entries older than ${retentionDaysNumber} days`,
      });
      return Array.from(next);
    });
  }, [autoArchiveEnabled, oldPartnerEntryIds, recordSystemEvent, retentionDaysNumber]);

  useEffect(() => {
    if (!selectedPartner) {
      setEditPartnerArrangementRate('0');
      setEditSystemAllocationPercent('0');
      return;
    }

    setEditPartnerArrangementRate((selectedPartner.partner_arrangement_rate || 0).toString());
    setEditSystemAllocationPercent((selectedPartner.system_allocation_percent || 0).toString());
  }, [selectedPartnerId, selectedPartner?.partner_arrangement_rate, selectedPartner?.system_allocation_percent]);

  useEffect(() => {
    if (!selectedPartner) {
      setAlignmentStartDate('');
      setAlignmentEndDate('');
      return;
    }

    const referredUnitIds = new Set(
      units
        .filter(unit => unit.referred_by_partner_id === selectedPartner.id)
        .map(unit => unit.id)
    );

    const referredWorkspaceDateSet = new Set<string>();
    entries.forEach(entry => {
      if (!referredUnitIds.has(entry.unit_id)) return;
      const workspace = workspaces.find(item => item.id === entry.workspace_id);
      if (workspace?.date) referredWorkspaceDateSet.add(workspace.date);
    });

    const sortedDates = Array.from(referredWorkspaceDateSet).sort();
    if (sortedDates.length === 0) {
      const today = new Date().toISOString().split('T')[0];
      setAlignmentStartDate(today);
      setAlignmentEndDate(today);
      return;
    }

    setAlignmentStartDate(sortedDates[0]);
    setAlignmentEndDate(sortedDates[sortedDates.length - 1]);
  }, [selectedPartnerId, units, entries, workspaces]);

  const selectedPartnerMetrics = useMemo(() => {
      if (!selectedPartner) {
        return {
          referredUnits: 0,
          referredActivity: 0,
          referredOperationalContribution: 0,
          perWorkspaceAlignments: [] as Array<{
            workspaceId: string;
            date: string;
            channel: string;
            activityUnits: number;
            systemContribution: number;
            partnerAdjustment: number;
            memberAdjustment: number;
            totalAdjustment: number;
          }>,
          summary: {
            totalPartnerAdjustment: 0,
            totalSystemAdjustment: 0,
            totalOverallAdjustment: 0,
          },
          referredHands: 0,
          referredServiceFee: 0,
          totalAdjustment: 0,
        };
      }

    const inDateRange = (dateValue: string) => {
      if (!dateValue) return false;
      if (alignmentStartDate && dateValue < alignmentStartDate) return false;
      if (alignmentEndDate && dateValue > alignmentEndDate) return false;
      return true;
    };

    const referredUnitIds = new Set(
      units
        .filter(unit => unit.referred_by_partner_id === selectedPartner.id)
        .map(unit => unit.id)
    );

    const workspaceById = new Map(workspaces.map(workspace => [workspace.id, workspace]));
    const alignmentMap = new Map<string, { workspaceId: string; date: string; channel: string; activityUnits: number; systemContribution: number }>();

    entries.forEach(entry => {
      if (!referredUnitIds.has(entry.unit_id)) return;
      const workspace = workspaceById.get(entry.workspace_id);
      if (!workspace || !inDateRange(workspace.date)) return;

      const existing = alignmentMap.get(workspace.id) ?? {
        workspaceId: workspace.id,
        date: workspace.date,
        channel: workspace.channel || 'Unknown',
        activityUnits: 0,
        systemContribution: workspace.operational_contribution || 0,
      };
      existing.activityUnits += entry.activity_count || 0;
      alignmentMap.set(workspace.id, existing);
    });

    const perWorkspaceAlignments = Array.from(alignmentMap.values())
      .map(item => {
        const partnerAdjustment = (selectedPartner.role === 'partner' || selectedPartner.role === 'hybrid')
          ? item.activityUnits * (selectedPartner.partner_arrangement_rate || 0)
          : 0;
        const systemAdjustment = (selectedPartner.role === 'channel' || selectedPartner.role === 'hybrid')
          ? item.systemContribution * ((selectedPartner.system_allocation_percent || 0) / 100)
          : 0;
        return {
          ...item,
          partnerAdjustment: partnerAdjustment,
          memberAdjustment: systemAdjustment,
          totalAdjustment: partnerAdjustment + systemAdjustment,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    const totalReferredActivity = perWorkspaceAlignments.reduce((sum, item) => sum + item.activityUnits, 0);
    const totalReferredContribution = perWorkspaceAlignments.reduce((sum, item) => sum + item.systemContribution, 0);

    return {
      referredUnits: referredUnitIds.size,
      referredActivity: totalReferredActivity,
      referredOperationalContribution: totalReferredContribution,
      perWorkspaceAlignments,
      summary: {
        totalPartnerAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.partnerAdjustment, 0),
        totalSystemAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.memberAdjustment, 0),
        totalOverallAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.totalAdjustment, 0),
      },
      // Keep for UI compatibility
      referredHands: totalReferredActivity,
      referredServiceFee: totalReferredContribution,
      totalAdjustment: perWorkspaceAlignments.reduce((sum, item) => sum + item.totalAdjustment, 0),
    };
  }, [selectedPartner, units, entries, workspaces, alignmentStartDate, alignmentEndDate]);

  const allPartnerMetrics = useMemo(() => {
    const map = new Map<string, { units: number; activity: number; contribution: number }>();
    
    partners.forEach(aff => {
      const referredUnitIds = new Set(
        units
          .filter(unit => unit.referred_by_partner_id === aff.id)
          .map(unit => unit.id)
      );
      
      let activity = 0;
      let contribution = 0;
      
      entries.forEach(entry => {
        if (!referredUnitIds.has(entry.unit_id)) return;
        activity += entry.activity_count || 0;
        const workspace = workspaces.find(w => w.id === entry.workspace_id);
        if (workspace?.operational_contribution) {
            // This is a simple sum for the list; detail uses start/end dates
            contribution += workspace.operational_contribution;
        }
      });
      
      map.set(aff.id, {
        units: referredUnitIds.size,
        activity,
        contribution
      });
    });
    
    return map;
  }, [partners, units, entries, workspaces]);

  const handleSavePartnerRules = async () => {
    if (!selectedPartner || !canManageValue) return;
    try {
      await updatePartner({
        ...selectedPartner,
        partner_arrangement_rate: parseNonNegativeNumber(editPartnerArrangementRate),
        system_allocation_percent: parseNonNegativeNumber(editSystemAllocationPercent),
      });
      notify({ type: 'success', message: 'Partner settings saved.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to save partner settings.' });
    }
  };

  const handleRecordEstimatedAdjustment = async () => {
    if (!selectedPartner || !canManageValue) return;
    if (alignmentStartDate && alignmentEndDate && alignmentStartDate > alignmentEndDate) {
      notify({ type: 'error', message: 'Alignment date range is invalid.' });
      return;
    }
    const estimatedAmount = selectedPartnerMetrics.totalAdjustment;
    if (estimatedAmount <= 0) {
      notify({ type: 'error', message: 'No pending entries to log yet.' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    try {
      await addPartnerEntry({
        partner_id: selectedPartner.id,
        type: 'adjustment',
        amount: estimatedAmount,
        date: today,
      });
      notify({ type: 'success', message: 'Estimated entry logged.' });
    } catch (error: any) {
      notify({ type: 'error', message: error?.message || 'Unable to log entry.' });
    }
  };

  const handleExportPartners = () => {
    const csv = Papa.unparse(partners.map(a => ({
      Name: a.name,
      Role: a.role,
      ContactMethod: a.contact_method,
      ContactValue: a.contact_value || '',
      Total: a.total,
      Status: a.status
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `partners_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportEntrys = () => {
    if (!selectedPartnerId) return;
    const partner = partners.find(a => a.id === selectedPartnerId);
    const csv = Papa.unparse(selectedEntrys.map(t => ({
      Date: formatDate(t.date),
      Type: t.type,
      Amount: t.amount
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${partner?.name || 'partner'}_entrys_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportActiveEntrys = () => {
    if (!selectedPartnerId) return;
    const partner = partners.find(a => a.id === selectedPartnerId);
    const csv = Papa.unparse(filteredActiveSelectedEntrys.map(t => ({
      Date: formatDate(t.date),
      Type: t.type,
      Amount: t.amount,
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${partner?.name || 'partner'}_entrys_active_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportArchivedEntrys = () => {
    if (!selectedPartnerId) return;
    const partner = partners.find(a => a.id === selectedPartnerId);
    const csv = Papa.unparse(filteredArchivedSelectedEntrys.map(t => ({
      Date: formatDate(t.date),
      Type: t.type,
      Amount: t.amount,
    })));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${partner?.name || 'partner'}_entrys_archived_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleArchiveEntrysByDateRange = () => {
    if (!canManageValue || !selectedPartnerId) return;
    if (!entryDateStart || !entryDateEnd) {
      notify({ type: 'error', message: 'Select both start and end date.' });
      return;
    }
    if (entryDateStart > entryDateEnd) {
      notify({ type: 'error', message: 'Start date cannot be after end date.' });
      return;
    }

    const ids = activeSelectedEntrys
      .filter(entry => entry.date >= entryDateStart && entry.date <= entryDateEnd)
      .map(entry => entry.id);

    if (ids.length === 0) {
      notify({ type: 'error', message: 'No active entries in selected range.' });
      return;
    }

    setArchivedPartnerEntryIds(current => Array.from(new Set([...current, ...ids])));
    void (recordSystemEvent as any)({ 
      action: 'partner_entries_archived_date_range',
      entity: 'partner_entry',
      amount: ids.length,
      details: `Hidden entries from ${entryDateStart} to ${entryDateEnd}`,
    });
    notify({ type: 'success', message: `Hidden ${ids.length} entries.` });
  };

  const handleArchiveOldEntrys = () => {
    if (!canManageValue) return;
    if (oldPartnerEntryIds.length === 0) {
      notify({ type: 'error', message: `No entries older than ${retentionDaysNumber} days.` });
      return;
    }
    setArchivedPartnerEntryIds(current => Array.from(new Set([...current, ...oldPartnerEntryIds])));
    void (recordSystemEvent as any)({ 
      action: 'partner_entries_archived_old',
      entity: 'partner_entry',
      amount: oldPartnerEntryIds.length,
      details: `Hidden old entries older than ${retentionDaysNumber} days`,
    });
    notify({ type: 'success', message: `Hidden ${oldPartnerEntryIds.length} old entries.` });
  };

  const handleRestoreAllArchivedEntrys = () => {
    if (!canManageValue || !selectedPartnerId) return;
    const selectedArchivedIds = archivedSelectedEntrys.map(entry => entry.id);
    if (selectedArchivedIds.length === 0) {
      notify({ type: 'error', message: 'No hidden entries to restore for this partner.' });
      return;
    }

    setArchivedPartnerEntryIds(current => current.filter(id => !selectedArchivedIds.includes(id)));
    void (recordSystemEvent as any)({ 
      action: 'partner_entries_restored_bulk',
      entity: 'partner_entry',
      amount: selectedArchivedIds.length,
      details: 'Restored all hidden entries for selected partner',
    });
    notify({ type: 'success', message: `Restored ${selectedArchivedIds.length} hidden entries.` });
  };

  return (
    <div className="page-shell animate-in fade-in">
      {!canManageValue && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-2 text-sm">
          Read-only mode: only admin/operator can create partners or log entries.
        </div>
      )}
      {!embedded ? (
        <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Partners</h2>
            <p className="text-stone-500 dark:text-stone-400 text-sm">Partner network, configuration, and activity logs.</p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <div className="hidden lg:flex items-center gap-2 text-xs">
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Partners: <span className="font-mono text-stone-900 dark:text-stone-100">{partners.length}</span>
              </span>
              <span className="rounded-full border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-stone-600 dark:text-stone-300">
                Entries: <span className="font-mono text-stone-900 dark:text-stone-100">{partnerEntries.length}</span>
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportPartners}
                className="action-btn-secondary"
              >
                <Download size={16} />
                Export CSV
              </button>
              <button
                onClick={() => setIsAdding(true)}
                disabled={!canManageValue}
                className="action-btn-primary"
              >
                <Plus size={16} />
                Add Partner
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <button
            onClick={handleExportPartners}
            className="action-btn-secondary"
          >
            <Download size={16} />
            Export CSV
          </button>
          <button
            onClick={() => setIsAdding(true)}
            disabled={!canManageValue}
            className="action-btn-primary"
          >
            <Plus size={16} />
            Add Partner
          </button>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleAddPartner} className="section-card p-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="font-medium mb-4 text-stone-900 dark:text-stone-100">New Partner</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <input 
              className="control-input" 
              placeholder="Name (optional)" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              disabled={!canManageValue}
            />
            <div className="space-y-1">
              <label className="text-xs font-medium text-stone-500 dark:text-stone-400">Type</label>
              <select 
                className="control-input"
                value={role}
                onChange={e => setRole(e.target.value as 'partner' | 'channel' | 'hybrid')}
                disabled={!canManageValue}
              >
                <option value="channel">Channel</option>
                <option value="partner">Partner</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Defines how this partner participates in entries.</p>
            </div>
            <select
              className="control-input"
              value={contactMethod}
              onChange={e => setContactMethod(e.target.value as 'none' | 'internal' | 'email' | 'telegram' | 'signal' | 'whatsapp')}
              disabled={!canManageValue}
            >
              <option value="none">No contact</option>
              <option value="internal">Internal reference</option>
              <option value="email">Email</option>
              <option value="telegram">Telegram</option>
              <option value="signal">Signal</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <input 
              className="control-input" 
              placeholder="Contact handle or reference" 
              value={contactValue} 
              onChange={e => setContactValue(e.target.value)} 
              disabled={!canManageValue || contactMethod === 'none'}
            />
            <div className="md:col-span-2 lg:col-span-1 border border-dashed border-stone-200 dark:border-stone-700 rounded-md flex items-center justify-center bg-stone-50/50 dark:bg-stone-800/30">
              <span className="text-[11px] text-stone-400 dark:text-stone-500 uppercase tracking-wider">Structured contact only</span>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 p-4 mb-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Partner Settings (optional)</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">Define allocation rules for this partner.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Partner Rate / Unit</label>
                <input
                  className="control-input"
                  type="number"
                  step="0.01"
                  value={newPartnerArrangementRate}
                  onChange={e => setNewPartnerArrangementRate(e.target.value)}
                  disabled={!canManageValue}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">System Allocation %</label>
                <input
                  className="control-input"
                  type="number"
                  step="0.1"
                  value={newSystemAllocationPercent}
                  onChange={e => setNewSystemAllocationPercent(e.target.value)}
                  disabled={!canManageValue}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button 
              type="button" 
              onClick={() => setIsAdding(false)}
              className="action-btn-tertiary px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={!canManageValue}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-sm hover:bg-stone-800 dark:hover:bg-stone-200"
            >
              Save Partner
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Partner List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="section-card p-4">
            <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100">Directory</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">Search partners from the list below.</p>
          </div>
          {activePartners.map(partner => (
            <div 
              key={partner.id}
              onClick={() => setSelectedPartnerId(partner.id)}
              className={cn(
                "section-card-hover p-4 cursor-pointer",
                selectedPartnerId === partner.id 
                  ? "border-emerald-500 ring-1 ring-emerald-500" 
                  : ""
              )}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-stone-900 dark:text-stone-100">{getPartnerDisplayName(partner.name)}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 capitalize">
                      {getPartnerRoleLabel(partner.role)}
                    </span>
                    <span className="text-xs text-stone-400">{getPartnerContactDisplay(partner.contact_method, partner.contact_value)}</span>
                  </div>
                  <div className="text-xs text-stone-400 mt-1">
                    {units.filter(p => p.referred_by_partner_id === partner.id).length} Linked Units
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-stone-500 dark:text-stone-400 uppercase tracking-wider">Total</p>
                  <p className={cn(
                    "font-mono font-medium",
                    partner.total > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                    partner.total < 0 ? "text-red-600 dark:text-red-400" : "text-stone-400"
                  )}>
                    {formatValue(partner.total)}
                  </p>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (canManageValue) void handleArchivePartner(partner.id);
                      }}
                      disabled={!canManageValue}
                      className="action-btn-tertiary px-2 py-1 text-[11px] disabled:opacity-50"
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (canManageValue) void handleDeletePartner(partner.id);
                      }}
                      disabled={!canManageValue || deletingPartnerId === partner.id}
                      className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      title={deletingPartnerId === partner.id ? 'Removing…' : 'Remove Partner'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {activePartners.length === 0 && (
            <div className="text-center py-12 text-stone-400 bg-stone-50 dark:bg-stone-900 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
              No partners found.
            </div>
          )}

          {archivedPartners.length > 0 && (
            <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Hidden Partners</h4>
                <button
                  type="button"
                  onClick={() => setIsArchivedPartnerListExpanded(prev => !prev)}
                  className="action-btn-secondary px-2.5 py-1 text-xs"
                >
                  {isArchivedPartnerListExpanded ? 'Hide' : `Show (${archivedPartners.length})`}
                </button>
              </div>

              {isArchivedPartnerListExpanded && (
                <div className="mt-3 space-y-3">
                  {archivedPartners.map(partner => (
                    <div
                      key={partner.id}
                      className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-3"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <h3 className="font-medium text-stone-900 dark:text-stone-100">{getPartnerDisplayName(partner.name)}</h3>
                          <p className="text-xs text-stone-500 dark:text-stone-400">{getPartnerRoleLabel(partner.role)} • hidden</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-0.5">Summary</p>
                          <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                            {allPartnerMetrics.get(partner.id)?.units || 0} units • {allPartnerMetrics.get(partner.id)?.activity || 0} units • {formatValue(allPartnerMetrics.get(partner.id)?.contribution || 0)}
                          </p>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => { if (canManageValue) void handleUnarchivePartner(partner.id); }}
                              disabled={!canManageValue}
                              className="action-btn-tertiary px-2 py-1 text-[11px] disabled:opacity-50"
                            >
                              Unhide
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (canManageValue) void handleDeletePartner(partner.id);
                              }}
                              disabled={!canManageValue || deletingPartnerId === partner.id}
                              className="action-btn-tertiary px-2 py-1 text-[11px] text-red-600 dark:text-red-400 disabled:opacity-50"
                            >
                              {deletingPartnerId === partner.id ? 'Removing…' : 'Remove'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2">
          {selectedPartner ? (
            <div className="section-card h-full flex flex-col">
              <div className="p-6 border-b border-stone-200 dark:border-stone-800 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-light text-stone-900 dark:text-stone-100">{getPartnerDisplayName(selectedPartner.name)}</h2>
                  <p className="text-sm text-stone-500 dark:text-stone-400">{getPartnerRoleLabel(selectedPartner.role)} • {selectedPartner.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-stone-500 dark:text-stone-400">Current Total</p>
                  <p className={cn(
                    "text-2xl font-light",
                    selectedPartner.total > 0 ? "text-emerald-600 dark:text-emerald-400" : 
                    selectedPartner.total < 0 ? "text-red-600 dark:text-red-400" : "text-stone-900 dark:text-stone-100"
                  )}>
                    {formatValue(selectedPartner.total)}
                  </p>
                  <p className="text-xs text-stone-400">
                    {selectedPartner.total > 0 ? "Net toward system" : selectedPartner.total < 0 ? "Net toward partner" : "Aligned"}
                  </p>
                </div>
              </div>

              <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 space-y-3">
                <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100">Partner Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                   <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Partner Rate / Unit</label>
                  <input
                    className="control-input"
                    type="number"
                    step="0.01"
                    value={editPartnerArrangementRate}
                    onChange={e => setEditPartnerArrangementRate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">System Allocation %</label>
                  <input
                    className="control-input"
                    type="number"
                    step="0.1"
                    value={editSystemAllocationPercent}
                    onChange={e => setEditSystemAllocationPercent(e.target.value)}
                  />
                </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-stone-500 dark:text-stone-400">Alignment Start</label>
                    <input
                      type="date"
                      className="control-input"
                      value={alignmentStartDate}
                      onChange={e => setAlignmentStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-stone-500 dark:text-stone-400">Alignment End</label>
                    <input
                      type="date"
                      className="control-input"
                      value={alignmentEndDate}
                      onChange={e => setAlignmentEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2">
                    <p className="text-stone-500 dark:text-stone-400">Range Activity Count</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{selectedPartnerMetrics.referredActivity}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2">
                    <p className="text-stone-500 dark:text-stone-400">Range Service Total</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{formatValue(selectedPartnerMetrics.referredServiceFee)}</p>
                  </div>
                  <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-2">
                    <p className="text-stone-500 dark:text-stone-400">Range Settings</p>
                    <p className="font-mono text-stone-900 dark:text-stone-100">{formatValue(selectedPartnerMetrics.totalAdjustment)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
                  <div className="px-3 py-2 border-b border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-400">
                    Per-workspace alignment in selected date range
                  </div>
                  <CollapsibleWorkspaceSection
                    title="Per-Workspace Alignment"
                    summary={`${selectedPartnerMetrics.perWorkspaceAlignments.length} activities`}
                    defaultExpanded={false}
                    maxExpandedHeightClass="max-h-52"
                    maxCollapsedHeightClass="max-h-[96px]"
                  >
                    <table className="w-full text-left text-[12px]">
                      <thead className="sticky top-0 bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                        <tr>
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Activity</th>
                          <th className="px-3 py-2 font-medium text-right">Activity Count</th>
                          <th className="px-3 py-2 font-medium text-right">Service Total</th>
                          <th className="px-3 py-2 font-medium text-right">Adjustment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                        {selectedPartnerMetrics.perWorkspaceAlignments.map(item => (
                          <tr key={item.workspaceId}>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">{formatDate(item.date)}</td>
                            <td className="px-3 py-2 text-stone-600 dark:text-stone-300">{item.channel}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{item.activityUnits}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(item.systemContribution)}</td>
                            <td className="px-3 py-2 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(item.totalAdjustment)}</td>
                          </tr>
                        ))}
                        {selectedPartnerMetrics.perWorkspaceAlignments.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-stone-400">No activities in selected range.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </CollapsibleWorkspaceSection>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { void handleSavePartnerRules(); }}
                    disabled={!canManageValue}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Save Rules
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleRecordEstimatedAdjustment(); }}
                    disabled={!canManageValue}
                    className="action-btn-primary text-xs disabled:opacity-50"
                  >
                    Estimated Log Entry
                  </button>
                </div>
              </div>

              <div className="p-6 bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800">
                <h3 className="text-sm font-medium text-stone-900 dark:text-stone-100 mb-3">Activity Logs</h3>
                <form onSubmit={handleAddEntry} className="flex flex-col sm:flex-row gap-2">
                  <select 
                    className="control-input text-sm"
                    value={transType}
                    onChange={e => setTransType(e.target.value as 'input' | 'output' | 'alignment' | 'adjustment')}
                    disabled={!canManageValue}
                  >
                    <option value="input">Input (Source &rarr; System)</option>
                    <option value="alignment">Alignment</option>
                    <option value="output">Output (System &rarr; Unit)</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                  <input 
                    type="number" 
                    placeholder="Amount" 
                    className="control-input text-sm w-32"
                    value={transAmount}
                    onChange={e => setTransAmount(e.target.value)}
                    disabled={!canManageValue}
                    required
                  />
                  <button type="button" onClick={handleExportEntrys} className="action-btn-secondary text-sm">Export All</button>
                  <button type="button" onClick={handleExportActiveEntrys} className="action-btn-secondary text-sm">Export Active</button>
                  <button type="button" onClick={handleExportArchivedEntrys} className="action-btn-secondary text-sm">Export Hidden</button>
                  <button type="submit" disabled={!canManageValue} className="action-btn-primary text-sm disabled:opacity-50">
                    Log Entry
                  </button>
                </form>
              </div>

              <div className="p-6 border-b border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40 space-y-3">
                <h4 className="text-sm font-medium text-stone-900 dark:text-stone-100">Entry Visibility Controls</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    className="control-input"
                    value={entrySearchQuery}
                    onChange={event => setEntrySearchQuery(event.target.value)}
                  />
                  <select
                    className="control-input"
                    value={entryTypeFilter}
                    onChange={event => setEntryTypeFilter(event.target.value as typeof entryTypeFilter)}
                  >
                    <option value="all">All types</option>
                    <option value="input">Input</option>
                    <option value="alignment">Alignment</option>
                    <option value="output">Output</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="date" className="control-input" value={entryDateStart} onChange={event => setEntryDateStart(event.target.value)} />
                  <input type="date" className="control-input" value={entryDateEnd} onChange={event => setEntryDateEnd(event.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleArchiveEntrysByDateRange}
                    disabled={!canManageValue || !selectedPartnerId}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Hide by Date Range
                  </button>
                  <button
                    type="button"
                    onClick={handleArchiveOldEntrys}
                    disabled={!canManageValue}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Hide Old ({retentionDaysNumber}+d)
                  </button>
                  <button
                    type="button"
                    onClick={handleRestoreAllArchivedEntrys}
                    disabled={!canManageValue || archivedSelectedEntrys.length === 0}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    Restore All Hidden
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    className="control-input"
                    value={retentionDays}
                    onChange={event => setRetentionDays(event.target.value)}
                    placeholder="Retention days"
                  />
                  <button
                    type="button"
                    onClick={() => setAutoArchiveEnabled(value => !value)}
                    disabled={!canManageValue}
                    className="action-btn-secondary text-xs disabled:opacity-50"
                  >
                    {autoArchiveEnabled ? 'Auto-Hide: On' : 'Auto-Hide: Off'}
                  </button>
                  <span className="text-xs text-stone-500 dark:text-stone-400">Older than {retentionDaysNumber} days</span>
                </div>
              </div>

              {/* Tabs for Entries vs Units */}
              <div className="border-b border-stone-200 dark:border-stone-800 px-6">
                <div className="flex gap-4">
                  <button 
                    onClick={() => setActiveTab('list')}
                    className={cn(
                      "py-3 text-sm font-medium border-b-2 transition-colors",
                      activeTab === 'list' ? "border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100" : "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700"
                    )}
                  >
                    Entries
                  </button>
                  <button 
                    onClick={() => setActiveTab('entrys')}
                    className={cn(
                      "py-3 text-sm font-medium border-b-2 transition-colors",
                      activeTab === 'entrys' ? "border-stone-900 dark:border-stone-100 text-stone-900 dark:text-stone-100" : "border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700"
                    )}
                  >
                    Linked Units
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-0">
                {activeTab === 'list' ? (
                  <>
                  <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
                    {filteredActiveSelectedEntrys.map(t => (
                      <MobileRecordCard
                        key={t.id}
                        title={<span className="text-xs text-stone-500 dark:text-stone-400 font-normal">{formatDate(t.date)}</span>}
                        right={(
                          <p className={cn(
                            "font-mono text-sm font-medium",
                            t.type === 'input' ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {t.type === 'input' ? '+' : '-'}{formatValue(t.amount)}
                          </p>
                        )}
                        meta={<span className="capitalize">{t.type}</span>}
                      >
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleArchivePartnerEntry(t.id)}
                            disabled={!canManageValue}
                            className="action-btn-tertiary px-2.5 py-1 text-xs disabled:opacity-50"
                          >
                            Hide
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (canManageValue) void handleDeletePartnerEntry(t.id); }}
                            disabled={!canManageValue || deletingPartnerEntryId === t.id}
                            className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                          >
                            {deletingPartnerEntryId === t.id ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      </MobileRecordCard>
                    ))}
                    {filteredActiveSelectedEntrys.length === 0 && (
                      <div className="px-6 py-10 text-center text-stone-400 text-sm">No entries recorded.</div>
                    )}
                  </div>

                  {archivedSelectedEntrys.length > 0 && (
                    <div className="mt-4 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/40 p-3 md:hidden">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Hidden Entries</h4>
                        <button
                          type="button"
                          onClick={() => setIsArchivedPartnerEntrysExpanded(prev => !prev)}
                          className="action-btn-secondary px-2.5 py-1 text-xs"
                        >
                          {isArchivedPartnerEntrysExpanded ? 'Hide' : `Show (${filteredArchivedSelectedEntrys.length})`}
                        </button>
                      </div>
                      {isArchivedPartnerEntrysExpanded && (
                        <div className="mt-3 divide-y divide-stone-100 dark:divide-stone-800">
                          {filteredArchivedSelectedEntrys.map(t => (
                            <MobileRecordCard
                              key={t.id}
                              title={<span className="text-xs text-stone-500 dark:text-stone-400 font-normal">{formatDate(t.date)}</span>}
                              right={<p className="font-mono text-sm font-medium text-stone-900 dark:text-stone-100">{formatValue(t.amount)}</p>}
                              meta={<span className="capitalize">{t.type}</span>}
                            >
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleUnarchivePartnerEntry(t.id)}
                                  disabled={!canManageValue}
                                  className="action-btn-tertiary px-2.5 py-1 text-xs disabled:opacity-50"
                                >
                                  Unhide
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { if (canManageValue) void handleDeletePartnerEntry(t.id); }}
                                  disabled={!canManageValue || deletingPartnerEntryId === t.id}
                                  className="action-btn-tertiary px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
                                >
                                  {deletingPartnerEntryId === t.id ? 'Removing…' : 'Remove'}
                                </button>
                              </div>
                            </MobileRecordCard>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <CollapsibleWorkspaceSection
                    title="Partner Entries"
                    summary={`${filteredActiveSelectedEntrys.length} entries`}
                    className="hidden md:block"
                    defaultExpanded={false}
                    maxExpandedHeightClass="max-h-[420px]"
                    maxCollapsedHeightClass="max-h-[96px]"
                  >
                  <table className="w-full min-w-[760px] workspace-fixed text-left text-[13px]">
                    <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                      <tr>
                        <th className="px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Date</th>
                        <th className="px-6 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Type</th>
                        <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Amount</th>
                        <th className="px-6 py-2.5 w-[170px] text-right text-[11px] font-semibold uppercase tracking-wide">Manage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                      {filteredActiveSelectedEntrys.map(t => (
                        <tr key={t.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                          <td className="px-6 py-2.5 text-stone-500 dark:text-stone-400">{formatDate(t.date)}</td>
                          <td className="px-6 py-2.5 capitalize">{t.type}</td>
                          <td className={cn(
                            "px-6 py-2.5 text-right font-mono",
                            t.type === 'input' ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                          )}>
                            {t.type === 'input' ? '+' : '-'}{formatValue(t.amount)}
                          </td>
                          <td className="px-6 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleArchivePartnerEntry(t.id)}
                              disabled={!canManageValue}
                              className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5 disabled:opacity-50"
                            >
                              Hide
                            </button>
                            <button
                              type="button"
                              onClick={() => { if (canManageValue) void handleDeletePartnerEntry(t.id); }}
                              disabled={!canManageValue || deletingPartnerEntryId === t.id}
                              className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={deletingPartnerEntryId === t.id ? 'Removing…' : 'Remove Entry'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filteredActiveSelectedEntrys.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-stone-400">
                            No entries recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </CollapsibleWorkspaceSection>

                  {archivedSelectedEntrys.length > 0 && (
                    <div className="hidden md:block mt-4">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h4 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Hidden Entries</h4>
                        <button
                          type="button"
                          onClick={() => setIsArchivedPartnerEntrysExpanded(prev => !prev)}
                          className="action-btn-secondary text-xs px-2.5 py-1.5"
                        >
                          {isArchivedPartnerEntrysExpanded ? 'Hide' : `Show (${filteredArchivedSelectedEntrys.length})`}
                        </button>
                      </div>
                      {isArchivedPartnerEntrysExpanded && (
                        <CollapsibleWorkspaceSection
                          title="Hidden Partner Entries"
                          summary={`${filteredArchivedSelectedEntrys.length} entries`}
                          defaultExpanded={false}
                          maxExpandedHeightClass="max-h-[420px]"
                          maxCollapsedHeightClass="max-h-[96px]"
                        >
                          <table className="w-full min-w-[760px] workspace-fixed text-left text-[13px]">
                            <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                              <tr>
                                <th className="px-6 py-2.5 w-[140px] text-[11px] font-semibold uppercase tracking-wide">Date</th>
                                <th className="px-6 py-2.5 w-[170px] text-[11px] font-semibold uppercase tracking-wide">Type</th>
                                <th className="px-6 py-2.5 w-[150px] text-right text-[11px] font-semibold uppercase tracking-wide">Amount</th>
                                <th className="px-6 py-2.5 w-[170px] text-right text-[11px] font-semibold uppercase tracking-wide">Manage</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                              {filteredArchivedSelectedEntrys.map(t => (
                                <tr key={t.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                                  <td className="px-6 py-2.5 text-stone-500 dark:text-stone-400">{formatDate(t.date)}</td>
                                  <td className="px-6 py-2.5 capitalize">{t.type}</td>
                                  <td className="px-6 py-2.5 text-right font-mono text-stone-900 dark:text-stone-100">{formatValue(t.amount)}</td>
                                  <td className="px-6 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleUnarchivePartnerEntry(t.id)}
                                      disabled={!canManageValue}
                                      className="action-btn-tertiary px-2 py-1 text-[11px] mr-1.5 disabled:opacity-50"
                                    >
                                      Unhide
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { if (canManageValue) void handleDeletePartnerEntry(t.id); }}
                                      disabled={!canManageValue || deletingPartnerEntryId === t.id}
                                      className="inline-flex items-center justify-center p-1.5 rounded-md text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                      title={deletingPartnerEntryId === t.id ? 'Removing…' : 'Remove Entry'}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {filteredArchivedSelectedEntrys.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="px-6 py-12 text-center text-stone-400">No hidden entries match current filters.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </CollapsibleWorkspaceSection>
                      )}
                    </div>
                  )}
                  </>
                ) : (
                  <div className="p-0">
                    <div className="md:hidden divide-y divide-stone-100 dark:divide-stone-800">
                      {units.filter(p => p.referred_by_partner_id === selectedPartnerId).map(p => (
                        <MobileRecordCard key={p.id} title={p.name}>
                        </MobileRecordCard>
                      ))}
                      {units.filter(p => p.referred_by_partner_id === selectedPartnerId).length === 0 && (
                        <div className="px-6 py-10 text-center text-stone-400 text-sm">No units referred yet.</div>
                      )}
                    </div>

                    <CollapsibleWorkspaceSection
                      title="Linked Units"
                      summary={`${units.filter(p => p.referred_by_partner_id === selectedPartnerId).length} units`}
                      className="hidden md:block"
                      defaultExpanded={false}
                      maxExpandedHeightClass="max-h-[420px]"
                      maxCollapsedHeightClass="max-h-[96px]"
                    >
                    <table className="w-full min-w-[760px] workspace-fixed text-left text-[13px]">
                      <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                        <tr>
                          <th className="px-6 py-2.5 w-[220px] text-[11px] font-semibold uppercase tracking-wide">Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                        {units.filter(p => p.referred_by_partner_id === selectedPartnerId).map(p => (
                          <tr key={p.id} className="odd:bg-white even:bg-stone-50/60 dark:odd:bg-stone-900 dark:even:bg-stone-900/60 hover:bg-stone-100/70 dark:hover:bg-stone-800 transition-colors">
                            <td className="px-6 py-2.5 font-medium text-stone-900 dark:text-stone-100">{p.name}</td>
                          </tr>
                        ))}
                        {units.filter(p => p.referred_by_partner_id === selectedPartnerId).length === 0 && (
                          <tr>
                            <td colSpan={1} className="px-6 py-12 text-center text-stone-400">
                              No units referred yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    </CollapsibleWorkspaceSection>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-stone-400 bg-stone-50 dark:bg-stone-900 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
              Select an partner to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
