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
  total_units: number;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Activity {
  id: string;
  org_id: string;
  label: string;
  date: string;
  status: 'active' | 'completed' | 'archived';
  channel_label?: string;
  assigned_user_id?: string;
  start_time?: string;
  end_time?: string;
  operational_weight?: number;
  channel_weight?: number;
  activity_mode?: 'value' | 'high_intensity';
  created_at?: string;
  updated_at?: string;
}

export interface ActivityRecord {
  id: string;
  org_id: string;
  activity_id: string;
  entity_id: string;
  direction: 'increase' | 'decrease' | 'transfer';
  status: 'pending' | 'applied' | 'deferred' | 'voided';
  unit_amount: number;
  target_entity_id?: string;
  position_id?: number;
  sort_order?: number;
  left_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TeamMember {
  id: string;
  org_id: string;
  name: string;
  staff_role: string;
  role?: string; 
  user_id?: string;
  arrangement_type?: 'hourly' | 'fixed' | 'percentage';
  overhead_weight?: number;
  service_rate?: number;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Collaboration {
  id: string;
  org_id: string;
  name: string;
  collaboration_type: 'channel' | 'collaboration' | 'hybrid';
  participation_factor: number;
  overhead_weight_pct: number;
  rules: any;
  created_at?: string;
  updated_at?: string;
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
  teamMember_id?: string; 
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
