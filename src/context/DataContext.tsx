import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Entity, Activity, ActivityRecord, TeamMember, Collaboration, SystemEvent, Channel, OperatorActivity, Organization, Cluster } from '../types';
import { dbRoleToAppRole } from '../lib/roles';
import { useAppRole } from './AppRoleContext';
import { useAuth } from './AuthContext';

interface DataContextType {
  entities: Entity[];
  activities: Activity[];
  records: ActivityRecord[];
  teamMembers: TeamMember[];
  collaborations: Collaboration[];
  channels: Channel[];
  systemEvents: SystemEvent[];
  activityLogs: OperatorActivity[];

  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
  loading: boolean;
  loadingProgress: number;
  isDemoMode: boolean;
  availableOrgs: Record<string, Organization>;
  switchOrg: (orgId: string) => Promise<void>;
  addUnit: (entity: any) => Promise<string>;
  updateUnit: (entity: Entity) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;

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

  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [records, setRecords] = useState<ActivityRecord[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [activityLogs, setActivityLogs] = useState<OperatorActivity[]>([]);
  const [availableOrgs, setAvailableOrgs] = useState<Record<string, Organization>>({});

  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('flow_ops_last_org_id');
  });

  const { loading: roleLoading, managedOrgIds, isClusterAdmin, clusterId } = useAppRole();
  const { loading: authLoading } = useAuth();
  const isDemoMode = !isSupabaseConfigured;

  const fetchData = async () => {
    if (!supabase || !activeOrgId || isDemoMode) {
      setLoading(false);
      return;
    }

    try {
      const [eRes, aRes, rRes, tRes, cRes, chRes, sRes, lRes] = await Promise.all([
        supabase.from('entities').select('*').order('name'),
        supabase.from('activities').select('*').order('date', { ascending: false }),
        supabase.from('records').select('*').order('created_at', { ascending: false }),
        supabase.from('team_members').select('*').order('name'),
        supabase.from('collaborations').select('*').order('name'),
        supabase.from('channels').select('*').order('name'),
        supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('operator_activities').select('*').order('started_at', { ascending: false }),
      ]);

      if (eRes.data) setEntities(eRes.data);
      if (aRes.data) setActivities(aRes.data);
      if (rRes.data) setRecords(rRes.data);
      if (tRes.data) setTeamMembers(tRes.data.map((m: any) => ({ ...m, role: m.staff_role })));
      if (cRes.data) setCollaborations(cRes.data);
      if (chRes.data) setChannels(chRes.data.map((c: any) => ({ ...c, is_active: c.status === 'active', category: 'General' })));
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

      // Fetch organization metadata for managedOrgIds is handled in its own effect below

    } catch (err) {
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

  // Dedicated effect: refresh available orgs whenever the admin's managed org list changes
  // This ensures the Scoped Context Switcher updates immediately after provisioning
  const refreshAvailableOrgs = async () => {
    if (!supabase || managedOrgIds.length === 0) {
      setAvailableOrgs({});
      return;
    }
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, tag, slug, cluster_id')
      .in('id', managedOrgIds);
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

  // Actions
  const addUnit = async (data: any) => {
    const orgId = requireOrgScope();
    const { data: newEntity, error } = await supabase!
      .from('entities')
      .insert([{ ...data, org_id: orgId, total_units: 0 }])
      .select('id')
      .single();
    if (error) throw error;
    await fetchData();
    return newEntity.id;
  };

  const updateUnit = async (entity: any) => {
    const { error } = await supabase!.from('entities').update(entity).eq('id', entity.id);
    if (error) throw error;
    await fetchData();
  };

  const deleteUnit = async (id: string) => {
    const { error } = await supabase!.from('entities').delete().eq('id', id);
    if (error) throw error;
    await fetchData();
  };

  const addActivity = async (data: any) => {
    const orgId = requireOrgScope();
    const { data: newActivity, error } = await supabase!
      .from('activities')
      .insert([{ ...data, org_id: orgId }])
      .select('id')
      .single();
    if (error) throw error;
    await fetchData();
    return newActivity.id;
  };

  const updateActivity = async (activity: any) => {
    const { error } = await supabase!.from('activities').update(activity).eq('id', activity.id);
    if (error) throw error;
    await fetchData();
  };

  const deleteActivity = async (id: string) => {
    const { error } = await supabase!.from('activities').delete().eq('id', id);
    if (error) throw error;
    await fetchData();
  };

  const addRecord = async (data: any) => {
    const orgId = requireOrgScope();
    const { error } = await supabase!
      .from('records')
      .insert([{ ...data, org_id: orgId }]);
    if (error) throw error;
    await fetchData();
  };

  const updateRecord = async (record: any) => {
    const { error } = await supabase!.from('records').update(record).eq('id', record.id);
    if (error) throw error;
    await fetchData();
  };

  const deleteRecord = async (id: string) => {
    const { error } = await supabase!.from('records').delete().eq('id', id);
    if (error) throw error;
    await fetchData();
  };

  const addActivityLog = async (data: any) => {
    const orgId = requireOrgScope();
    const { data: { user } } = await supabase!.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase!
      .from('operator_activities')
      .insert([{ 
        ...data, 
        org_id: orgId, 
        is_active: true,
        actor_user_id: user.id,
        started_at: new Date().toISOString(),
        last_active_at: new Date().toISOString()
      }]);
    if (error) throw error;
    await fetchData();
  };

  const endActivityLog = async (id: string, endedAt: string, duration: number, pay?: number) => {
    const { error } = await supabase!
      .from('operator_activities')
      .update({ ended_at: endedAt, duration_seconds: Math.floor(duration * 3600), is_active: false })
      .eq('id', id);
    if (error) throw error;
    await fetchData();
  };

  const requestAdjustment = async (data: any) => {
    const orgId = requireOrgScope();
    const { error } = await supabase!
      .from('records')
      .insert([{ 
        org_id: orgId,
        entity_id: data.entity_id,
        unit_amount: data.amount,
        direction: data.type === 'input' ? 'increase' : 'decrease',
        status: 'deferred',
        notes: data.notes || 'Adjustment request'
      }]);
    if (error) throw error;
    await fetchData();
  };

  const addChannelRecord = async (data: any) => {
    console.log("Channel record added:", data);
  };

  const transferUnits = async (data: any) => {
    const orgId = requireOrgScope();
    // Inter-entity transfer creates two records or one 'transfer' record
    const { error } = await supabase!
      .from('records')
      .insert([{ 
        org_id: orgId,
        entity_id: data.from_entity_id,
        target_entity_id: data.to_entity_id,
        unit_amount: data.amount,
        direction: 'transfer',
        status: 'applied',
        notes: `Transfer to ${data.to_entity_name}`
      }]);
    if (error) throw error;
    await fetchData();
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

  const value: DataContextType = {
    entities,
    activities,
    records,
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
    addUnit,
    updateUnit,
    deleteUnit,
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
