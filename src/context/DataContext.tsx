import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  Entity,
  Activity,
  ActivityRecord,
  RosterProfile,
  Collaboration,
  SystemEvent,
  Channel,
  OperatorActivity,
  Organization,
  AuditActivityIntegrity,
  AuditEntityHealth,
  AuditOrgIntegrity,
  AuditChannelIntegrity,
  AuditAnomaly,
} from '../types';
import { dbRoleToAppRole } from '../lib/roles';
import { DATA_SELECT } from '../lib/dataFetchSelects';
import { useAppRole } from './AppRoleContext';
import { useAuth } from './AuthContext';

export interface EntityBalance {
  id: string;
  org_id: string;
  name: string;
  net: number;
  total_inflow: number;
  record_count: number;
  surplus_count: number;
  last_active: string | null;
  avg_duration_hours: number;
}

interface DataContextType {
  entities: Entity[];
  entityBalances: Map<string, EntityBalance>;
  activities: Activity[];
  records: ActivityRecord[];
  auditActivities: AuditActivityIntegrity[];
  auditEntities: AuditEntityHealth[];
  auditOrgs: AuditOrgIntegrity[];
  auditChannels: AuditChannelIntegrity[];
  auditAnomalies: AuditAnomaly[];
  rosterProfiles: RosterProfile[];
  collaborations: Collaboration[];
  channels: Channel[];
  systemEvents: SystemEvent[];
  activityLogs: OperatorActivity[];

  // Indexed Lookups (Calculated)
  recordsByActivityId: Record<string, ActivityRecord[]>;
  recordsByEntityId: Record<string, ActivityRecord[]>;

  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
  loading: boolean;
  loadingProgress: number;
  availableOrgs: Record<string, Organization>;
  switchOrg: (orgId: string) => Promise<void>;
  addEntity: (entity: any) => Promise<string>;
  updateEntity: (entity: Entity) => Promise<void>;
  deleteEntity: (id: string) => Promise<void>;

  // Activity Actions
  addActivity: (activity: any) => Promise<string>;
  updateActivity: (activity: Activity) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;

  // Records Actions
  addRecord: (record: any) => Promise<void>;
  updateRecord: (record: ActivityRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;

  // Operator Activity / Logs
  addActivityLog: (log: any) => Promise<void>;
  endActivityLog: (id: string, endedAt: string, duration: number, pay?: number) => Promise<void>;
  
  // Extra Actions
  requestAdjustment: (data: any) => Promise<void>;
  addChannelRecord: (data: any) => Promise<void>;
  transferUnits: (data: any) => Promise<void>;

  addRosterProfile: (data: any) => Promise<void>;
  updateRosterProfile: (member: any) => Promise<void>;
  deleteRosterProfile: (id: string) => Promise<void>;

  addCollaboration: (data: any) => Promise<string>;
  updateCollaboration: (collab: any) => Promise<void>;
  deleteCollaboration: (id: string) => Promise<void>;

  addTransferAccount: (data: any) => Promise<void>;
  updateTransferAccount: (data: any) => Promise<void>;
  deleteTransferAccount: (id: string) => Promise<void>;

  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entityBalances, setEntityBalances] = useState<Map<string, EntityBalance>>(new Map());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [auditActivities, setAuditActivities] = useState<AuditActivityIntegrity[]>([]);
  const [auditEntities, setAuditEntities] = useState<AuditEntityHealth[]>([]);
  const [auditOrgs, setAuditOrgs] = useState<AuditOrgIntegrity[]>([]);
  const [auditChannels, setAuditChannels] = useState<AuditChannelIntegrity[]>([]);
  const [auditAnomalies, setAuditAnomalies] = useState<AuditAnomaly[]>([]);
  const [rosterProfiles, setRosterProfiles] = useState<RosterProfile[]>([]);
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [activityLogs, setActivityLogs] = useState<OperatorActivity[]>([]);
  const [availableOrgs, setAvailableOrgs] = useState<Record<string, Organization>>({});

  // In-flight deduplication: prevents double-submit from rapid clicks
  const inflightRef = React.useRef<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('flow_ops_last_org_id');
  });

  const { loading: roleLoading, managedOrgIds, serverActiveOrgId, isClusterAdmin, clusterId } = useAppRole();
  const { user, loading: authLoading, signOut } = useAuth();


  const resetClientDataState = useCallback(() => {
    setEntities([]);
    setEntityBalances(new Map());
    setActivities([]);
    setRecords([]);
    setAuditActivities([]);
    setAuditEntities([]);
    setAuditOrgs([]);
    setAuditChannels([]);
    setAuditAnomalies([]);
    setRosterProfiles([]);
    setCollaborations([]);
    setChannels([]);
    setSystemEvents([]);
    setActivityLogs([]);
    setAvailableOrgs({});
    setActiveOrgId(null);
    setLoading(false);
    setLoadingProgress(0);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('flow_ops_last_org_id');
    }
  }, []);

  const isAuthFailure = useCallback((error: unknown) => {
    if (!error || typeof error !== 'object') return false;

    const candidate = error as { status?: unknown; message?: unknown; code?: unknown };
    const status = typeof candidate.status === 'number' ? candidate.status : undefined;
    const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
    const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';

    return (
      status === 401 ||
      status === 403 ||
      message.includes('auth') ||
      message.includes('jwt') ||
      message.includes('session') ||
      message.includes('token') ||
      code.includes('jwt')
    );
  }, []);

  const ensureWorkspaceLedgerActivityId = useCallback(async () => {
    const orgId = requireOrgScope();
    const existingActivity = activities.find(activity => activity.label === 'Workspace ledger');
    if (existingActivity?.id) {
      return existingActivity.id;
    }

    const { data: existingRows, error: lookupError } = await supabase!
      .from('activities')
      .select('id')
      .eq('org_id', orgId)
      .eq('label', 'Workspace ledger')
      .order('created_at', { ascending: true })
      .limit(1);

    if (lookupError) throw lookupError;
    if (existingRows && existingRows.length > 0) {
      return existingRows[0].id as string;
    }

    const { data, error } = await supabase!
      .from('activities')
      .insert([{
        org_id: orgId,
        label: 'Workspace ledger',
        status: 'active',
        channel_label: 'Workspace ledger',
        date: new Date().toISOString(),
        start_time: new Date().toISOString(),
      }])
      .select('id')
      .single();

    if (error) throw error;
    return data.id as string;
  }, [activities]);

  const insertTransferPair = useCallback(async (data: {
    org_id: string;
    activity_id: string;
    from_entity_id: string;
    to_entity_id: string;
    unit_amount: number;
    status: ActivityRecord['status'];
    transfer_group_id?: string | null;
    channel_label?: string;
    source_note?: string;
    target_note?: string;
  }) => {
    const transferGroupId = data.transfer_group_id || crypto.randomUUID();
    const { error } = await supabase!
      .from('records')
      .insert([
        {
          org_id: data.org_id,
          activity_id: data.activity_id,
          entity_id: data.from_entity_id,
          target_entity_id: data.to_entity_id,
          direction: 'decrease',
          status: data.status,
          unit_amount: data.unit_amount,
          transfer_group_id: transferGroupId,
          channel_label: data.channel_label,
          notes: data.source_note,
        },
        {
          org_id: data.org_id,
          activity_id: data.activity_id,
          entity_id: data.to_entity_id,
          target_entity_id: data.from_entity_id,
          direction: 'increase',
          status: data.status,
          unit_amount: data.unit_amount,
          transfer_group_id: transferGroupId,
          channel_label: data.channel_label,
          notes: data.target_note,
        },
      ]);

    if (error) throw error;
  }, []);

  const fetchData = async () => {
    if (!supabase || !activeOrgId) {
      setLoading(false);
      setLoadingProgress(0);
      return;
    }

    const orgSnapshot = activeOrgId;

    try {
      setLoading(true);
      setLoadingProgress(8);
      setAuditActivities([]);
      setAuditEntities([]);
      setAuditOrgs([]);
      setAuditChannels([]);
      setAuditAnomalies([]);

      const [eRes, aRes, rRes, tRes, cRes, chRes, sRes, lRes, ebRes] = await Promise.all([
        supabase.from('entities').select(DATA_SELECT.entities).eq('org_id', orgSnapshot).order('name'),
        supabase.from('activities').select(DATA_SELECT.activities).eq('org_id', orgSnapshot).order('date', { ascending: false }),
        supabase.from('records').select(DATA_SELECT.records).eq('org_id', orgSnapshot).order('created_at', { ascending: false }),
        supabase.from('team_members').select(DATA_SELECT.team_members).eq('org_id', orgSnapshot).order('name'),
        supabase.from('collaborations').select(DATA_SELECT.collaborations).eq('org_id', orgSnapshot).order('name'),
        supabase.from('channels').select(DATA_SELECT.channels).eq('org_id', orgSnapshot).order('name'),
        supabase.from('audit_events').select(DATA_SELECT.audit_events).eq('org_id', orgSnapshot).order('created_at', { ascending: false }).limit(100),
        supabase.from('operator_activities').select(DATA_SELECT.operator_activities).eq('org_id', orgSnapshot).order('started_at', { ascending: false }),
        supabase.from('entity_balances').select(DATA_SELECT.entity_balances).eq('org_id', orgSnapshot),
      ]);

      if (orgSnapshot !== activeOrgId) return;

      const phase1All = [eRes, aRes, rRes, tRes, cRes, chRes, sRes, lRes, ebRes];
      const authError = phase1All.map((r) => r.error).find((error) => isAuthFailure(error));
      if (authError) {
        console.warn('Authentication failed during org fetch. Resetting local session state.', authError);
        await signOut({ scope: 'local' });
        return;
      }

      const coreResponses = [eRes, aRes, rRes, tRes, cRes, chRes, sRes, lRes];
      const firstCoreError = coreResponses.map((r) => r.error).find(Boolean);
      if (firstCoreError) {
        throw firstCoreError;
      }

      setLoadingProgress(72);

      if (eRes.data) setEntities(eRes.data);
      if (aRes.data) setActivities(aRes.data);
      if (rRes.data) setRecords(rRes.data);
      if (tRes.data) setRosterProfiles(tRes.data.map((m: any) => ({ ...m, role: m.staff_role })));
      if (cRes.data) {
        setCollaborations(
          cRes.data.map((c: any) => ({ ...c, total_number: c.total_number ?? 0 })),
        );
      }
      if (chRes.data) setChannels(chRes.data.map((c: any) => ({ ...c, is_active: c.status === 'active' })));
      if (lRes.data) {
        setActivityLogs(lRes.data.map((item: any) => ({
          ...item,
          start_time: item.started_at,
          end_time: item.ended_at,
          duration_hours: item.duration_seconds ? item.duration_seconds / 3600 : 0,
          status: item.is_active ? 'active' : 'completed',
        })));
      }

      if (sRes.data) {
        setSystemEvents(sRes.data.map((item: any) => ({
          id: item.id,
          timestamp: item.created_at,
          actor_user_id: item.actor_user_id,
          actor_label: item.actor_label,
          actor_role: dbRoleToAppRole(item.actor_role),
          action: item.action,
          entity: item.entity,
          entity_id: item.entity_id,
          amount: item.amount,
          details: item.details,
        })));
      }

      if (ebRes.error) {
        const code = (ebRes.error as { code?: string }).code;
        const msg = String(ebRes.error.message || '');
        const unitsHint = msg.includes('total_units')
          ? ' (Stale view definitions may still reference removed columns — re-apply audit views from 00000000000000_init_canonical_schema.sql or run supabase db reset in dev.)'
          : '';
        if (code === 'PGRST205') {
          console.warn(
            '[flow-ops] entity_balances not exposed to PostgREST (PGRST205). Apply ledger views from 00000000000000_init_canonical_schema.sql, then reload schema.',
          );
        } else {
          console.warn(`Optional dataset entity_balances failed to load. Continuing without it.${unitsHint}`, ebRes.error);
        }
      }
      if (ebRes.data) {
        const balanceMap = new Map<string, EntityBalance>();
        (ebRes.data as EntityBalance[]).forEach((row) => balanceMap.set(row.id, row));
        setEntityBalances(balanceMap);
      }

      setLoadingProgress(100);
      setLoading(false);
      setLoadingProgress(0);

      const [aaRes, aeRes, aoRes, acRes, anRes] = await Promise.all([
        supabase.from('audit_activity_integrity').select(DATA_SELECT.audit_activity_integrity).eq('org_id', orgSnapshot).order('status').order('net_amount', { ascending: false }),
        supabase.from('audit_entity_health').select(DATA_SELECT.audit_entity_health).eq('org_id', orgSnapshot).order('net_amount', { ascending: true }),
        supabase.from('audit_org_integrity').select(DATA_SELECT.audit_org_integrity).eq('org_id', orgSnapshot),
        supabase.from('audit_channel_integrity').select(DATA_SELECT.audit_channel_integrity).eq('org_id', orgSnapshot).order('status').order('net_amount', { ascending: false }),
        supabase.from('audit_record_anomalies').select(DATA_SELECT.audit_record_anomalies).eq('org_id', orgSnapshot).order('severity').order('anomaly_type'),
      ]);

      if (orgSnapshot !== activeOrgId) return;

      const optionalResponseEntries = [
        ['audit_activity_integrity', aaRes],
        ['audit_entity_health', aeRes],
        ['audit_org_integrity', aoRes],
        ['audit_channel_integrity', acRes],
        ['audit_record_anomalies', anRes],
      ] as const;

      const optionalErrors = optionalResponseEntries.filter(([, r]) => r.error);
      const schemaCacheMisses = optionalErrors.filter(
        ([, r]) => (r.error as { code?: string })?.code === 'PGRST205',
      );
      if (schemaCacheMisses.length > 0) {
        console.warn(
          `[flow-ops] Optional DB views not exposed to PostgREST (${schemaCacheMisses.map(([n]) => n).join(', ')}). Apply supabase/migrations/00000000000000_init_canonical_schema.sql (ledger views) on this project, then reload schema.`,
        );
      }
      for (const [name, response] of optionalErrors) {
        if ((response.error as { code?: string })?.code === 'PGRST205') continue;
        const msg = String(response.error?.message || '');
        const unitsHint = msg.includes('total_units')
          ? ' (Stale view definitions may still reference removed columns — re-apply audit views from 00000000000000_init_canonical_schema.sql or run supabase db reset in dev.)'
          : '';
        console.warn(`Optional dataset ${name} failed to load. Continuing without it.${unitsHint}`, response.error);
      }

      if (aaRes.data) setAuditActivities(aaRes.data as AuditActivityIntegrity[]);
      if (aeRes.data) setAuditEntities(aeRes.data as AuditEntityHealth[]);
      if (aoRes.data) setAuditOrgs(aoRes.data as AuditOrgIntegrity[]);
      if (acRes.data) setAuditChannels(acRes.data as AuditChannelIntegrity[]);
      if (anRes.data) setAuditAnomalies(anRes.data as AuditAnomaly[]);
    } catch (err) {
      if (isAuthFailure(err)) {
        console.warn('Authentication failed while loading org data. Resetting local session state.', err);
        await signOut({ scope: 'local' });
        return;
      }
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
      setLoadingProgress(0);
    }
  };

  useEffect(() => {
    if (!authLoading && !roleLoading) {
      fetchData();
    }
  }, [authLoading, roleLoading, activeOrgId]);

  useEffect(() => {
    if (authLoading || user) return;
    resetClientDataState();
  }, [authLoading, resetClientDataState, user]);

  // Effect: Synchronize activeOrgId with server on every role-load.
  // Strategy:
  //   1. localStorage gives us an instant first value (no flicker on reload).
  //   2. Once managedOrgIds resolves we validate it: if the cached ID is still in
  //      our allowed set we keep it (zero extra fetch). If it's stale (org removed,
  //      session switched) we fall through to serverActiveOrgId → first managed org.
  useEffect(() => {
    if (roleLoading || authLoading || managedOrgIds.length === 0) return;

    // Fast path: cached value is still valid — nothing to do.
    if (activeOrgId && managedOrgIds.includes(activeOrgId)) return;

    // Slow / stale path: resolve a valid target.
    const target = serverActiveOrgId && managedOrgIds.includes(serverActiveOrgId)
      ? serverActiveOrgId
      : managedOrgIds[0];

    if (!target) return;

    setActiveOrgId(target);
    localStorage.setItem('flow_ops_last_org_id', target);

    // Persist to server so the next session resolves instantly too.
    if (supabase && user?.id) {
      supabase.from('profiles').update({ active_org_id: target }).eq('id', user.id).then(({ error }) => {
        if (error) console.error('Error persisting org context:', error);
      });
    }
  }, [roleLoading, authLoading, serverActiveOrgId, managedOrgIds.join(','), activeOrgId, user?.id]);

  // Dedicated effect: refresh available orgs whenever the admin's managed org list changes
  // This ensures the Scoped Context Switcher updates immediately after provisioning
  const refreshAvailableOrgs = async () => {
    if (!supabase || managedOrgIds.length === 0) {
      setAvailableOrgs({});
      return;
    }
    const { data: orgs, error } = await supabase
      .from('organizations')
      .select('*')
      .in('id', managedOrgIds);

    if (error) {
      if (isAuthFailure(error)) {
        console.warn('Authentication failed while refreshing available orgs. Resetting local session state.', error);
        await signOut({ scope: 'local' });
        return;
      }

      console.error('Error fetching available organizations:', error);
      return;
    }

    if (orgs) {
      const orgMap = (orgs as any[]).reduce((acc, org) => ({ ...acc, [org.id]: org }), {} as Record<string, Organization>);
      setAvailableOrgs(orgMap);
    }
  };

  useEffect(() => {
    if (!roleLoading) refreshAvailableOrgs();
  }, [managedOrgIds.join(','), roleLoading]);

  const requireOrgScope = () => {
    if (!activeOrgId) throw new Error("Organization context required.");
    return activeOrgId;
  };

  // ─── Targeted re-fetchers ────────────────────────────────────────────────
  // Called instead of full fetchData() after record-affecting mutations.
  // Only fetches the 2 tables whose data is computed/aggregated by the DB.
  const refreshRecordsAndBalances = async (orgId: string) => {
    if (!supabase) return;
    const [rRes, ebRes] = await Promise.all([
      supabase.from('records').select(DATA_SELECT.records).eq('org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('entity_balances').select(DATA_SELECT.entity_balances).eq('org_id', orgId),
    ]);
    if (rRes.data) setRecords(rRes.data);
    if (ebRes.error) {
      const hint =
        String(ebRes.error.message || '').includes('total_units')
          ? ' Stale entity_balances / audit views — re-apply the view section of 00000000000000_init_canonical_schema.sql or refresh the database from the current baseline.'
          : '';
      console.warn(`[flow-ops] entity_balances refresh failed:${hint}`, ebRes.error);
    }
    if (ebRes.data) {
      const map = new Map<string, EntityBalance>();
      (ebRes.data as EntityBalance[]).forEach(r => map.set(r.id, r));
      setEntityBalances(map);
    }
  };

  const refreshActivityLogs = async (orgId: string) => {
    if (!supabase) return;
    const { data } = await supabase
      .from('operator_activities')
      .select(DATA_SELECT.operator_activities)
      .eq('org_id', orgId)
      .order('started_at', { ascending: false });
    if (data) {
      setActivityLogs(data.map((item: any) => ({
        ...item,
        start_time: item.started_at,
        end_time: item.ended_at,
        duration_hours: item.duration_seconds ? item.duration_seconds / 3600 : 0,
        status: item.is_active ? 'active' : 'completed',
      })));
    }
  };

  // ─── In-flight guard ─────────────────────────────────────────────────────
  // Wraps an async operation so that concurrent calls with the same key
  // are rejected instantly (prevents double-submit duplicates).
  const withInflight = <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (inflightRef.current.has(key)) {
      return Promise.reject(new Error('Operation already in progress — please wait.'));
    }
    inflightRef.current.add(key);
    return fn().finally(() => { inflightRef.current.delete(key); });
  };

  // ─── Entity mutations (optimistic local update — 1 DB call, 0 refetch) ──
  const addEntity = async (data: any) => {
    const orgId = requireOrgScope();
    const key = `addEntity:${orgId}:${String(data.name).toLowerCase()}`;
    return withInflight(key, async () => {
      const { data: row, error } = await supabase!
        .from('entities')
        .insert([{
          org_id: orgId,
          name: data.name,
          collaboration_id: data.collaboration_id,
          referred_by_entity_id: data.referred_by_entity_id,
          referring_collaboration_id: data.referring_collaboration_id,
          starting_total: Number(data.total) || 0,
        }])
        .select('*')
        .single();
      if (error) throw error;
      setEntities(prev => [...prev, row]);
      return row.id as string;
    });
  };

  const updateEntity = async (entity: any) => {
    return withInflight(`updateEntity:${entity.id}`, async () => {
      const { data: row, error } = await supabase!
        .from('entities')
        .update({
          name: entity.name,
          collaboration_id: entity.collaboration_id,
          referred_by_entity_id: entity.referred_by_entity_id,
          referring_collaboration_id: entity.referring_collaboration_id,
        })
        .eq('id', entity.id)
        .select('*')
        .single();
      if (error) throw error;
      if (row) setEntities(prev => prev.map(e => e.id === entity.id ? row : e));
    });
  };

  const deleteEntity = async (id: string) => {
    return withInflight(`deleteEntity:${id}`, async () => {
      const orgId = requireOrgScope();
      
      // Clean up records referencing this entity by id or target id
      const { error: recordsError } = await supabase!.from('records')
        .delete()
        .or(`entity_id.eq.${id},target_entity_id.eq.${id}`);
      if (recordsError) throw recordsError;

      const { error } = await supabase!.from('entities').delete().eq('id', id);
      if (error) throw error;
      setEntities(prev => prev.filter(e => e.id !== id));
      await refreshRecordsAndBalances(orgId);
    });
  };

  // ─── Activity mutations (optimistic local update) ─────────────────────────
  const addActivity = async (data: any) => {
    const orgId = requireOrgScope();
    const label = String(data.label || data.name || '').trim() || 'Untitled activity';
    const dateStr = typeof data.date === 'string' ? data.date : '';
    const timeStr = typeof (data.start_time ?? data.startTime) === 'string' ? (data.start_time ?? data.startTime) : '';
    let dateIso: string;
    let startTimeIso: string;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && /^\d{2}:\d{2}/.test(timeStr)) {
      const local = new Date(`${dateStr}T${timeStr.slice(0, 5)}:00`);
      if (!Number.isNaN(local.getTime())) {
        startTimeIso = local.toISOString();
        dateIso = startTimeIso;
      } else {
        const now = new Date().toISOString();
        dateIso = now;
        startTimeIso = now;
      }
    } else if (dateStr) {
      const parsed = new Date(dateStr);
      const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
      dateIso = base.toISOString();
      startTimeIso = dateIso;
    } else {
      const now = new Date().toISOString();
      dateIso = now;
      startTimeIso = now;
    }

    const key = `addActivity:${orgId}:${label.toLowerCase()}:${dateIso}`;
    return withInflight(key, async () => {
      const { data: row, error } = await supabase!
        .from('activities')
        .insert([{
          org_id: orgId,
          label,
          date: dateIso,
          start_time: startTimeIso,
          status: data.status || 'active',
          channel_label: data.channel_label || data.channel,
          assigned_user_id: data.assigned_user_id,
          activity_mode: data.activity_mode || 'value',
        }])
        .select('*')
        .single();
      if (error) throw error;
      setActivities(prev => [{ ...row, date: dateIso }, ...prev]);
      return row.id as string;
    });
  };

  const updateActivity = async (activity: any) => {
    return withInflight(`updateActivity:${activity.id}`, async () => {
      const resolvedDate = activity.date;
      const updates: any = {
        label: activity.label || activity.name,
        date: resolvedDate,
        start_time: activity.start_time || activity.startTime,
        status: activity.status || 'active',
        channel_label: activity.channel_label || activity.channel,
        assigned_user_id: activity.assigned_user_id,
      };
      if (activity.activity_mode != null && activity.activity_mode !== '') {
        updates.activity_mode = activity.activity_mode;
      }

      const { data: row, error } = await supabase!
        .from('activities').update(updates).eq('id', activity.id).select('*').single();
      if (error) throw error;
      if (row) {
        setActivities(prev => prev.map(a => a.id === activity.id ? { ...row, date: resolvedDate } : a));
      }
    });
  };

  const deleteActivity = async (id: string) => {
    return withInflight(`deleteActivity:${id}`, async () => {
      const orgId = requireOrgScope();
      
      // First, delete associated records to avoid foreign key violations
      // Correct table name is 'records'
      const { error: recordsError } = await supabase!.from('records').delete().eq('activity_id', id);
      if (recordsError) throw recordsError;

      // Now delete the activity itself
      const { error } = await supabase!.from('activities').delete().eq('id', id);
      if (error) throw error;
      
      setActivities(prev => prev.filter(a => a.id !== id));
      // Refresh balances to reflect the removed records
      await refreshRecordsAndBalances(orgId);
    });
  };

  // ─── Record mutations (targeted 2-query refresh — records + balances) ─────
  const addRecord = async (data: any) => {
    const orgId = requireOrgScope();
    const activityId = data.activity_id || await ensureWorkspaceLedgerActivityId();

    if (data.direction === 'transfer') {
      if (!data.entity_id || !data.target_entity_id) {
        throw new Error('Transfers must include both source and destination entities.');
      }
      if (data.entity_id === data.target_entity_id) {
        throw new Error('Transfers must move between different entities.');
      }
      const tgId = data.transfer_group_id || crypto.randomUUID();
      const key = `transfer:${orgId}:${data.entity_id}:${data.target_entity_id}:${data.unit_amount}:${tgId}`;
      return withInflight(key, async () => {
        await insertTransferPair({
          org_id: orgId,
          activity_id: activityId,
          from_entity_id: data.entity_id,
          to_entity_id: data.target_entity_id,
          unit_amount: data.unit_amount,
          status: data.status || 'pending',
          transfer_group_id: tgId,
          channel_label: data.channel_label,
          source_note: data.notes || 'Transfer out',
          target_note: data.target_notes || 'Transfer in',
        });
        await refreshRecordsAndBalances(orgId);
      });
    }

    const key = `addRecord:${orgId}:${data.entity_id}:${data.direction}:${data.unit_amount}:${activityId}`;
    return withInflight(key, async () => {
      const recordData: any = {
        org_id: orgId,
        activity_id: activityId,
        entity_id: data.entity_id,
        direction: data.direction,
        status: data.status || 'pending',
        unit_amount: data.unit_amount,
        transfer_group_id: data.transfer_group_id,
        notes: data.notes,
      };
      if (data.channel_label) recordData.channel_label = data.channel_label;
      const { error } = await supabase!.from('records').insert([recordData]);
      if (error) throw error;
      await refreshRecordsAndBalances(orgId);
    });
  };

  const updateRecord = async (record: any) => {
    const orgId = requireOrgScope();
    return withInflight(`updateRecord:${record.id}`, async () => {
      const { error } = await supabase!.from('records').update({
        activity_id: record.activity_id,
        entity_id: record.entity_id,
        direction: record.direction,
        status: record.status,
        unit_amount: record.unit_amount,
        transfer_group_id: record.transfer_group_id,
        notes: record.notes,
      }).eq('id', record.id);
      if (error) throw error;
      await refreshRecordsAndBalances(orgId);
    });
  };

  const deleteRecord = async (id: string) => {
    const orgId = requireOrgScope();
    return withInflight(`deleteRecord:${id}`, async () => {
      const { error } = await supabase!.from('records').delete().eq('id', id);
      if (error) throw error;
      await refreshRecordsAndBalances(orgId);
    });
  };

  // ─── Operator activity log mutations ─────────────────────────────────────
  const addActivityLog = async (data: any) => {
    const orgId = requireOrgScope();
    const key = `addLog:${orgId}:${user?.id}`;
    return withInflight(key, async () => {
      const { data: { user: authUser } } = await supabase!.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');
      const row: Record<string, unknown> = {
        org_id: orgId,
        actor_user_id: authUser.id,
        actor_role: data.actor_role || 'operator',
        actor_label: data.actor_label || authUser.email,
        started_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        is_active: true,
      };
      if (data.activity_id != null && data.activity_id !== '') {
        row.activity_id = data.activity_id;
      }
      const { error } = await supabase!.from('operator_activities').insert([row]);
      if (error) throw error;
      await refreshActivityLogs(orgId);
    });
  };

  const endActivityLog = async (id: string, endedAt: string, duration: number, _pay?: number) => {
    const orgId = requireOrgScope();
    return withInflight(`endLog:${id}`, async () => {
      const { error } = await supabase!
        .from('operator_activities')
        .update({ ended_at: endedAt, duration_seconds: Math.floor(duration * 3600), is_active: false })
        .eq('id', id);
      if (error) throw error;
      await refreshActivityLogs(orgId);
    });
  };

  // ─── Adjustment / channel record mutations ────────────────────────────────
  const requestAdjustment = async (data: any) => {
    const orgId = requireOrgScope();
    const key = `adjust:${orgId}:${data.entity_id}:${data.type}:${data.amount}`;
    return withInflight(key, async () => {
      const recordData: any = {
        org_id: orgId,
        entity_id: data.entity_id,
        unit_amount: data.amount,
        direction: data.type === 'input' ? 'increase' : 'decrease',
        status: 'deferred',
        notes: data.notes || 'Adjustment request',
        activity_id: data.activity_id ?? null,
      };
      if (data.channel_label) recordData.channel_label = data.channel_label;
      const { error } = await supabase!.from('records').insert([recordData]);
      if (error) throw error;
      await refreshRecordsAndBalances(orgId);
    });
  };

  const addChannelRecord = async (data: any) => {
    const orgId = requireOrgScope();
    const activityId = await ensureWorkspaceLedgerActivityId();
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Enter a valid amount greater than zero.');
    }
    const method = typeof data.method === 'string' ? data.method.trim() : '';
    if (!method) {
      throw new Error('Select or enter a channel before saving.');
    }
    const key = `channelRecord:${orgId}:${data.type}:${amount}:${method}`;
    return withInflight(key, async () => {
      const { error } = await supabase!
        .from('records')
        .insert([{
          org_id: orgId,
          activity_id: activityId,
          direction: data.type === 'increment' ? 'increase' : 'decrease',
          status: data.status || 'applied',
          unit_amount: amount,
          transfer_group_id: data.transfer_group_id,
          channel_label: method,
          notes: data.notes || `Channel entry: ${method}`,
        }]);
      if (error) throw error;
      await refreshRecordsAndBalances(orgId);
    });
  };

  const transferUnits = async (data: any) => {
    const orgId = requireOrgScope();
    const activityId = data.activity_id || await ensureWorkspaceLedgerActivityId();
    const tgId = data.transfer_group_id || crypto.randomUUID();
    const key = `transfer:${orgId}:${data.from_entity_id}:${data.to_entity_id}:${data.amount}:${tgId}`;
    return withInflight(key, async () => {
      await insertTransferPair({
        org_id: orgId,
        activity_id: activityId,
        from_entity_id: data.from_entity_id,
        to_entity_id: data.to_entity_id,
        unit_amount: data.amount,
        status: data.status || 'applied',
        transfer_group_id: tgId,
        channel_label: data.channel_label,
        source_note: data.from_note || `Transfer to ${data.to_entity_name || data.to_entity_id}`,
        target_note: data.to_note || `Transfer from ${data.from_entity_name || data.from_entity_id}`,
      });
      await refreshRecordsAndBalances(orgId);
    });
  };

  // ─── Roster profile mutations (`team_members`; optimistic local update) ──
  const addRosterProfile = async (data: any) => {
    const orgId = requireOrgScope();
    const key = `addMember:${orgId}:${String(data.name).toLowerCase()}`;
    return withInflight(key, async () => {
      const { data: row, error } = await supabase!
        .from('team_members')
        .insert([{ org_id: orgId, name: data.name, staff_role: data.role, user_id: data.user_id || null }])
        .select('*')
        .single();
      if (error) throw error;
      setRosterProfiles(prev => [...prev, { ...row, role: row.staff_role }]);
    });
  };

  const updateRosterProfile = async (member: any) => {
    return withInflight(`updateMember:${member.id}`, async () => {
      const { data: row, error } = await supabase!
        .from('team_members')
        .update({ name: member.name, staff_role: member.role || member.staff_role, user_id: member.user_id })
        .eq('id', member.id)
        .select('*')
        .single();
      if (error) throw error;
      if (row) setRosterProfiles(prev => prev.map(m => m.id === member.id ? { ...row, role: row.staff_role } : m));
    });
  };

  const deleteRosterProfile = async (id: string) => {
    return withInflight(`deleteMember:${id}`, async () => {
      const orgId = requireOrgScope();

      const { data: row, error: fetchError } = await supabase!
        .from('team_members')
        .select('user_id')
        .eq('id', id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (fetchError) throw fetchError;

      if (row?.user_id) {
        const { error: logsError } = await supabase!.from('operator_activities')
          .delete()
          .eq('org_id', orgId)
          .eq('actor_user_id', row.user_id);
        if (logsError) throw logsError;
      }

      const { error } = await supabase!.from('team_members').delete().eq('id', id);
      if (error) throw error;
      setRosterProfiles(prev => prev.filter(m => m.id !== id));
    });
  };

  // ─── Collaboration mutations (optimistic local update) ────────────────────
  const addCollaboration = async (data: any) => {
    const orgId = requireOrgScope();
    const key = `addCollab:${orgId}:${String(data.name).toLowerCase()}`;
    return withInflight(key, async () => {
      const { data: row, error } = await supabase!
        .from('collaborations')
        .insert([{
          org_id: orgId,
          name: data.name,
          status: 'active',
          collaboration_type: data.collaboration_type || 'channel',
          participation_factor: data.participation_factor ?? 0,
          overhead_weight_pct: data.overhead_weight_pct ?? 0,
          rules: data.rules || {},
        }])
        .select('*')
        .single();
      if (error) throw error;
      setCollaborations(prev => [...prev, row]);
      return row.id as string;
    });
  };

  const updateCollaboration = async (collab: any) => {
    return withInflight(`updateCollab:${collab.id}`, async () => {
      const { data: row, error } = await supabase!
        .from('collaborations')
        .update({ name: collab.name, collaboration_type: collab.collaboration_type,
          status: collab.status || 'active', participation_factor: collab.participation_factor, overhead_weight_pct: collab.overhead_weight_pct,
          rules: collab.rules })
        .eq('id', collab.id)
        .select('*')
        .single();
      if (error) throw error;
      if (row) setCollaborations(prev => prev.map(c => c.id === collab.id ? row : c));
    });
  };

  const deleteCollaboration = async (id: string) => {
    return withInflight(`deleteCollab:${id}`, async () => {
      const orgId = requireOrgScope();

      // Deleting a collaboration (Profile) should nullify or clean up entities that depend on it
      // For now, we'll nullify the reference in entities to avoid orphan entities 
      // but still allow the collaboration to be deleted.
      const { error: entitiesError } = await supabase!.from('entities')
        .update({ collaboration_id: null })
        .eq('collaboration_id', id);
      if (entitiesError) throw entitiesError;

      const { error: referringError } = await supabase!.from('entities')
        .update({ referring_collaboration_id: null })
        .eq('referring_collaboration_id', id);
      if (referringError) throw referringError;

      const { error } = await supabase!.from('collaborations').delete().eq('id', id);
      if (error) throw error;
      setCollaborations(prev => prev.filter(c => c.id !== id));
      await fetchData();
    });
  };

  // ─── Channel (transfer account) mutations (optimistic local update) ───────
  const addTransferAccount = async (data: any) => {
    const orgId = requireOrgScope();
    const key = `addChannel:${orgId}:${String(data.name).toLowerCase()}`;
    return withInflight(key, async () => {
      const { data: row, error } = await supabase!
        .from('channels')
        .insert([{ org_id: orgId, name: data.name, notes: data.category, status: 'active' }])
        .select('*')
        .single();
      if (error) throw error;
      setChannels(prev => [...prev, { ...row, is_active: row.status === 'active' }]);
    });
  };

  const updateTransferAccount = async (data: any) => {
    return withInflight(`updateChannel:${data.id}`, async () => {
      const { data: row, error } = await supabase!
        .from('channels')
        .update({ name: data.name, notes: data.category })
        .eq('id', data.id)
        .select('*')
        .single();
      if (error) throw error;
      if (row) setChannels(prev => prev.map(c => c.id === data.id ? { ...row, is_active: row.status === 'active' } : c));
    });
  };

  const deleteTransferAccount = async (id: string) => {
    return withInflight(`deleteChannel:${id}`, async () => {
      const orgId = requireOrgScope();
      const channel = channels.find(c => c.id === id);

      const { data: links, error: linkErr } = await supabase!
        .from('channel_records')
        .select('record_id')
        .eq('org_id', orgId)
        .eq('channel_id', id);
      if (linkErr) throw linkErr;

      const recordIds = [...new Set((links ?? []).map((r: { record_id: string }) => r.record_id).filter(Boolean))];
      if (recordIds.length > 0) {
        const { error: recErr } = await supabase!.from('records').delete().in('id', recordIds);
        if (recErr) throw recErr;
      } else if (channel?.name) {
        const { error: recordsError } = await supabase!.from('records')
          .delete()
          .eq('org_id', orgId)
          .eq('channel_label', channel.name);
        if (recordsError) throw recordsError;
      }

      const { error } = await supabase!.from('channels').delete().eq('id', id);
      if (error) throw error;
      setChannels(prev => prev.filter(c => c.id !== id));
      await refreshRecordsAndBalances(orgId);
    });
  };
  const { refreshAuthority } = useAppRole();

  const switchOrg = async (orgId: string) => {
    setActiveOrgId(orgId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('flow_ops_last_org_id', orgId);
    }
    
    const { data: { user } } = await supabase!.auth.getUser();
    if (user) {
      const selectedOrg = availableOrgs[orgId];
      const updates: any = { active_org_id: orgId };
      if (selectedOrg?.cluster_id) {
        updates.active_cluster_id = selectedOrg.cluster_id;
      } else {
        // Fallback: fetch org cluster_id if not in availableOrgs map yet
        const { data: orgData } = await supabase!.from('organizations').select('cluster_id').eq('id', orgId).maybeSingle();
        if (orgData?.cluster_id) updates.active_cluster_id = orgData.cluster_id;
      }
      await supabase!.from('profiles').update(updates).eq('id', user.id);
      
      // CRITICAL: Refresh role context after profile update to sync authority
      await refreshAuthority();
    }
    
    // fetchData will be triggered by useEffect dependency on activeOrgId
  };

  // Performance-optimized lookups
  const recordsByActivityId = React.useMemo(() => {
    const map: Record<string, ActivityRecord[]> = {};
    records.forEach(r => {
      if (r.activity_id) {
        if (!map[r.activity_id]) map[r.activity_id] = [];
        map[r.activity_id].push(r);
      }
    });
    return map;
  }, [records]);

  const recordsByEntityId = React.useMemo(() => {
    const map: Record<string, ActivityRecord[]> = {};
    records.forEach(r => {
      if (!r.entity_id) return;
      if (!map[r.entity_id]) map[r.entity_id] = [];
      map[r.entity_id].push(r);
    });
    return map;
  }, [records]);

  const value: DataContextType = {
    entities,
    entityBalances,
    activities,
    records,
    auditActivities,
    auditEntities,
    auditOrgs,
    auditChannels,
    auditAnomalies,
    rosterProfiles,
    collaborations,
    channels,
    systemEvents,
    activityLogs,
    activeOrgId,
    setActiveOrgId,
    availableOrgs,
    switchOrg,
    loading,
    loadingProgress,
    recordsByActivityId,
    recordsByEntityId,
    addEntity,
    updateEntity,
    deleteEntity,
    addActivity,
    updateActivity,
    deleteActivity,
    addRecord,
    updateRecord,
    deleteRecord,
    addActivityLog,
    endActivityLog,
    requestAdjustment,
    addChannelRecord,
    transferUnits,
    addRosterProfile,
    updateRosterProfile,
    deleteRosterProfile,
    addCollaboration,
    updateCollaboration,
    deleteCollaboration,
    addTransferAccount,
    updateTransferAccount,
    deleteTransferAccount,
    refreshData: fetchData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
