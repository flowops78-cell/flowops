export type AppRole = 'admin' | 'operator' | 'viewer';

export interface Profile {
  id: string;
  active_cluster_id?: string;
  active_org_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Cluster {
  id: string;
  name: string;
  tag?: string;
  slug?: string;
  created_by?: string;
  created_at: string;
}

export interface Organization {
  id: string;
  cluster_id: string;
  name: string;
  tag?: string;
  slug?: string;
  created_at: string;
}

export interface OrganizationMembership {
  id: string;
  user_id: string;
  org_id: string;
  role: AppRole;
  status: 'active' | 'invited' | 'disabled' | 'revoked';
  is_default_org: boolean;
  created_at: string;
}

export interface Entity {
  id: string;
  org_id: string;
  name: string;
  collaboration_id?: string;
  referred_by_entity_id?: string;
  referring_collaboration_id?: string;
  total?: number;
  total_net?: number;
  starting_total?: number;
  last_active_at?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Activity {
  id: string;
  org_id: string;
  name?: string;
  label: string;
  date: string;
  start_time: string;
  status: 'active' | 'completed' | 'archived';
  channel_label?: string;
  location?: string;
  assigned_user_id?: string;
  activity_mode?: 'value';
  created_at?: string;
  updated_at?: string;
}

export interface ActivityRecord {
  id: string;
  org_id: string;
  activity_id?: string | null;
  entity_id?: string | null;
  direction: 'increase' | 'decrease' | 'transfer';
  status: 'pending' | 'applied' | 'deferred' | 'voided';
  unit_amount: number;
  transfer_group_id?: string | null;
  target_entity_id?: string | null;
  channel_label?: string;
  position_id?: number;
  sort_order?: number;
  left_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuditActivityIntegrity {
  org_id: string;
  activity_id: string;
  activity_label: string;
  activity_date: string;
  total_records: number;
  applied_record_count: number;
  open_record_count: number;
  total_increase: number;
  total_decrease: number;
  net_amount: number;
  status: 'ok' | 'broken';
  last_record_at?: string | null;
}

export interface AuditEntityHealth {
  org_id: string;
  entity_id: string;
  entity_name: string;
  total_records: number;
  applied_record_count: number;
  total_increase: number;
  total_decrease: number;
  net_amount: number;
  status: 'ok' | 'watch';
  last_record_at?: string | null;
}

export interface AuditOrgIntegrity {
  org_id: string;
  org_name: string;
  total_records: number;
  applied_record_count: number;
  total_increase: number;
  total_decrease: number;
  net_amount: number;
  broken_activity_count: number;
  status: 'ok' | 'broken';
}

export interface AuditChannelIntegrity {
  org_id: string;
  channel_label: string;
  total_records: number;
  applied_record_count: number;
  total_increase: number;
  total_decrease: number;
  net_amount: number;
  status: 'ok' | 'broken';
}

export interface AuditAnomaly {
  anomaly_id: string;
  org_id: string;
  anomaly_type: string;
  severity: 'warning' | 'error';
  activity_id?: string | null;
  entity_id?: string | null;
  channel_label?: string | null;
  affected_count: number;
  detail: string;
}

/** Workspace people row (`public.team_members`). UI: roster profile; distinct from auth user until `user_id` is set. */
export interface RosterProfile {
  id: string;
  org_id: string;
  name: string;
  staff_role: string;
  role?: string;
  status?: 'active' | 'inactive';
  user_id?: string;
  arrangement_type?: 'hourly' | 'fixed' | 'percentage';
  overhead_weight?: number;
  service_rate?: number;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

/** Network profile row. UI calls this a “network profile”; stored `collaboration_type` values are historic names (`channel` = reserve/flow routing, not the Channels reserve-account list). */
export interface Collaboration {
  id: string;
  org_id: string;
  name: string;
  collaboration_type: 'channel' | 'collaboration' | 'hybrid';
  /** @deprecated Same meaning as `collaboration_type` on older rows */
  role?: 'channel' | 'collaboration' | 'hybrid';
  participation_factor: number;
  /** @deprecated Prefer `participation_factor` */
  allocation_factor?: number;
  overhead_weight_pct: number;
  /** @deprecated Prefer `overhead_weight_pct` */
  overhead_weight?: number;
  /** Not a DB column; UI defaults from API via DataContext (`total_number ?? 0`). */
  total_number?: number;
  status: 'active' | 'inactive' | 'archived';
  rules: any;
  created_at?: string;
  updated_at?: string;
}

export interface CollaborationAllocation {
  id: string;
  collaboration_id: string;
  type: 'input' | 'output' | 'alignment' | 'adjustment';
  amount: number;
  date: string;
  created_at?: string;
}

export interface Channel {
  id: string;
  org_id: string;
  name: string;
  status: 'active' | 'inactive' | 'archived';
  is_active?: boolean; 
  category?: string; 
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OperatorActivity {
  id: string;
  org_id: string;
  actor_user_id: string;
  activity_id?: string; 
  actor_role: AppRole;
  actor_label?: string;
  started_at: string;
  start_time?: string; 
  last_active_at: string;
  ended_at?: string;
  end_time?: string; 
  duration_seconds?: number;
  duration_hours?: number; 
  is_active: boolean;
  status?: 'active' | 'completed'; 
  created_at?: string;
}

export interface SystemEvent {
  id: string;
  timestamp: string;
  actor_user_id?: string;
  actor_label?: string;
  actor_role: AppRole;
  action: string;
  entity?: string;
  entity_id?: string;
  amount?: number;
  details?: string;
}
