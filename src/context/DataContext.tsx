import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  Entity,
  Activity,
  ActivityRecord,
  TeamMember,
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
  teamMembers: TeamMember[];
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
  isDemoMode: boolean;
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

  addTeamMember: (data: any) => Promise<void>;
  updateTeamMember: (member: any) => Promise<void>;
  deleteTeamMember: (id: string) => Promise<void>;

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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
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
  const isDemoMode = !isSupabaseConfigured;

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
    setTeamMembers([]);
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
    if (!supabase || !activeOrgId || isDemoMode) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [eRes, aRes, rRes, tRes, cRes, chRes, sRes, lRes, ebRes, aaRes, aeRes, aoRes, acRes, anRes] = await Promise.all([
        supabase.from('entities').select('*').eq('org_id', activeOrgId).order('name'),
        supabase.from('activities').select('*').eq('org_id', activeOrgId).order('date', { ascending: false }),
        supabase.from('records').select('*').eq('org_id', activeOrgId).order('created_at', { ascending: false }),
        supabase.from('team_members').select('*').eq('org_id', activeOrgId).order('name'),
        supabase.from('collaborations').select('*').eq('org_id', activeOrgId).order('name'),
        supabase.from('channels').select('*').eq('org_id', activeOrgId).order('name'),
        supabase.from('audit_events').select('*').eq('org_id', activeOrgId).order('created_at', { ascending: false }).limit(100),
        supabase.from('operator_activities').select('*').eq('org_id', activeOrgId).order('started_at', { ascending: false }),
        supabase.from('entity_balances').select('*').eq('org_id', activeOrgId),
        supabase.from('audit_activity_integrity').select('*').eq('org_id', activeOrgId).order('status').order('net_amount', { ascending: false }),
        supabase.from('audit_entity_health').select('*').eq('org_id', activeOrgId).order('net_amount', { ascending: true }),
        supabase.from('audit_org_integrity').select('*').eq('org_id', activeOrgId),
        supabase.from('audit_channel_integrity').select('*').eq('org_id', activeOrgId).order('status').order('net_amount', { ascending: false }),
        supabase.from('audit_record_anomalies').select('*').eq('org_id', activeOrgId).order('severity').order('anomaly_type'),
      ]);

      const responses = [eRes, aRes, rRes, tRes, cRes, chRes, sRes, lRes, ebRes, aaRes, aeRes, aoRes, acRes, anRes];
      const authError = responses.map((response) => response.error).find((error) => isAuthFailure(error));
      if (authError) {
        console.warn('Authentication failed during org fetch. Resetting local session state.', authError);
        await signOut({ scope: 'local' });
        return;
      }

      const firstError = responses.map((response) => response.error).find(Boolean);
      if (firstError) {
        throw firstError;
      }

      if (eRes.data) setEntities(eRes.data);
      if (aRes.data) setActivities(aRes.data);
      if (rRes.data) setRecords(rRes.data);
      if (tRes.data) setTeamMembers(tRes.data.map((m: any) => ({ ...m, role: m.staff_role })));
      if (cRes.data) setCollaborations(cRes.data);
      if (chRes.data) setChannels(chRes.data.map((c: any) => ({ ...c, is_active: c.status === 'active' })));
      if (lRes.data) {
        setActivityLogs(lRes.data.map((item: any) => ({
          ...item,
          teamMember_id: item.actor_user_id,
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

      if (ebRes.data) {
        const balanceMap = new Map<string, EntityBalance>();
        (ebRes.data as EntityBalance[]).forEach(row => balanceMap.set(row.id, row));
        setEntityBalances(balanceMap);
      }

      if (aaRes.data) setAuditActivities(aaRes.data as AuditActivityIntegrity[]);
      if (aeRes.data) setAuditEntities(aeRes.data as AuditEntityHealth[]);
      if (aoRes.data) setAuditOrgs(aoRes.data as AuditOrgIntegrity[]);
      if (acRes.data) setAuditChannels(acRes.data as AuditChannelIntegrity[]);
      if (anRes.data) setAuditAnomalies(anRes.data as AuditAnomaly[]);

      // Fetch organization metadata for managedOrgIds is handled in its own effect below

    } catch (err) {
      if (isAuthFailure(err)) {
        console.warn('Authentication failed while loading org data. Resetting local session state.', err);
        await signOut({ scope: 'local' });
        return;
      }
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
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
    if (roleLoading || authLoading || isDemoMode || managedOrgIds.length === 0) return;

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
  }, [roleLoading, authLoading, serverActiveOrgId, managedOrgIds.join(','), activeOrgId, user?.id, isDemoMode]);

  // Dedicated effect: refresh available orgs whenever the admin's managed org list changes
  // This ensures the Scoped Context Switcher updates immediately after provisioning
  const refreshAvailableOrgs = async () => {
    if (!supabase || managedOrgIds.length === 0) {
      setAvailableOrgs({});
      return;
    }
    const { data: orgs, error } = await supabase
      .from('organizations')
      .select('id, name, tag, slug, cluster_id')
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
      supabase.from('records').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
      supabase.from('entity_balances').select('*').eq('org_id', orgId),
    ]);
    if (rRes.data) setRecords(rRes.data);
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
      .select('*')
      .eq('org_id', orgId)
      .order('started_at', { ascending: false });
    if (data) {
      setActivityLogs(data.map((item: any) => ({
        ...item,
        teamMember_id: item.actor_user_id,
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
      const { error } = await supabase!.from('entities').delete().eq('id', id);
      if (error) throw error;
      setEntities(prev => prev.filter(e => e.id !== id));
      await refreshRecordsAndBalances(orgId);
    });
  };

  // ─── Activity mutations (optimistic local update) ─────────────────────────
  const addActivity = async (data: any) => {
    const orgId = requireOrgScope();
    const key = `addActivity:${orgId}:${String(data.label ?? data.name).toLowerCase()}:${data.date}`;
    return withInflight(key, async () => {
      const { data: row, error } = await supabase!
        .from('activities')
        .insert([{
          org_id: orgId,
          label: data.label || data.name,
          date: data.date,
          status: data.status || 'active',
          channel_label: data.channel_label || data.channel,
          assigned_user_id: data.assigned_user_id,
        }])
        .select('*')
        .single();
      if (error) throw error;
      setActivities(prev => [row, ...prev]);
      return row.id as string;
    });
  };

  const updateActivity = async (activity: any) => {
    return withInflight(`updateActivity:${activity.id}`, async () => {
      const updates: any = {
        label: activity.label || activity.name,
        date: activity.date,
        status: activity.status || 'active',
        channel_label: activity.channel_label || activity.channel,
        assigned_user_id: activity.assigned_user_id,
      };
      if (activity.start_time) updates.start_time = activity.start_time;
      if (activity.operational_weight !== undefined) updates.operational_weight = activity.operational_weight;
      if (activity.channel_weight !== undefined) updates.channel_weight = activity.channel_weight;
      if (activity.activity_mode) updates.activity_mode = activity.activity_mode;

      const { data: row, error } = await supabase!
        .from('activities').update(updates).eq('id', activity.id).select('*').single();
      if (error) throw error;
      if (row) setActivities(prev => prev.map(a => a.id === activity.id ? row : a));
    });
  };

  const deleteActivity = async (id: string) => {
    return withInflight(`deleteActivity:${id}`, async () => {
      const orgId = requireOrgScope();
      const { error } = await supabase!.from('activities').delete().eq('id', id);
      if (error) throw error;
      setActivities(prev => prev.filter(a => a.id !== id));
      // Records referencing this activity still exist — refresh to reflect reality
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
      const { error } = await supabase!
        .from('operator_activities')
        .insert([{
          org_id: orgId,
          actor_user_id: authUser.id,
          actor_role: data.actor_role || 'operator',
          actor_label: data.actor_label || authUser.email,
          started_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
          is_active: true,
        }]);
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
    const key = `channelRecord:${orgId}:${data.type}:${data.amount}:${data.method}`;
    return withInflight(key, async () => {
      const { error } = await supabase!
        .from('records')
        .insert([{
          org_id: orgId,
          activity_id: activityId,
          direction: data.type === 'increment' ? 'increase' : 'decrease',
          status: data.status || 'applied',
          unit_amount: data.amount,
          transfer_group_id: data.transfer_group_id,
          channel_label: data.method,
          notes: data.notes || `Channel entry: ${data.method}`,
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

  // ─── Team member mutations (optimistic local update) ─────────────────────
  const addTeamMember = async (data: any) => {
    const orgId = requireOrgScope();
    const key = `addMember:${orgId}:${String(data.name).toLowerCase()}`;
    return withInflight(key, async () => {
      const { data: row, error } = await supabase!
        .from('team_members')
        .insert([{ org_id: orgId, name: data.name, staff_role: data.role, user_id: data.user_id || null }])
        .select('*')
        .single();
      if (error) throw error;
      setTeamMembers(prev => [...prev, { ...row, role: row.staff_role }]);
    });
  };

  const updateTeamMember = async (member: any) => {
    return withInflight(`updateMember:${member.id}`, async () => {
      const { data: row, error } = await supabase!
        .from('team_members')
        .update({ name: member.name, staff_role: member.role || member.staff_role, user_id: member.user_id })
        .eq('id', member.id)
        .select('*')
        .single();
      if (error) throw error;
      if (row) setTeamMembers(prev => prev.map(m => m.id === member.id ? { ...row, role: row.staff_role } : m));
    });
  };

  const deleteTeamMember = async (id: string) => {
    return withInflight(`deleteMember:${id}`, async () => {
      const { error } = await supabase!.from('team_members').delete().eq('id', id);
      if (error) throw error;
      setTeamMembers(prev => prev.filter(m => m.id !== id));
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
          participation_factor: collab.participation_factor, overhead_weight_pct: collab.overhead_weight_pct,
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
      const { error } = await supabase!.from('collaborations').delete().eq('id', id);
      if (error) throw error;
      setCollaborations(prev => prev.filter(c => c.id !== id));
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
      const { error } = await supabase!.from('channels').delete().eq('id', id);
      if (error) throw error;
      setChannels(prev => prev.filter(c => c.id !== id));
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
    teamMembers,
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
    isDemoMode,
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
    addTeamMember,
    updateTeamMember,
    deleteTeamMember,
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
