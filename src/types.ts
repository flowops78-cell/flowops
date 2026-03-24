export interface Entity {
  id: string;
  org_id?: string;
  meta_org_id?: string | null;
  name: string;
  tags?: string[];
  total?: number;
  created_at?: string;
  attributed_associate_id?: string;
  referred_by_partner_id?: string;
  last_active_at?: string;
  total_input?: number;
  total_net?: number;
}

export interface Member {
  id: string;
  org_id?: string;
  meta_org_id?: string | null;
  name: string;
  member_id?: string;
  user_id?: string;
  role: 'operator' | 'viewer' | 'admin';
  arrangement_type?: 'hourly' | 'monthly' | 'none';
  overhead_weight?: number;
  service_rate?: number;
  retainer_rate?: number;
  status: 'active' | 'completed' | 'archived';
  tags?: string[];
  created_at?: string;
}

export interface ActivityLog {
  id: string;
  org_id?: string;
  meta_org_id?: string | null;
  member_id: string;
  workspace_id?: string;
  user_id?: string;
  start_time: string;
  end_time?: string;
  duration_hours?: number;
  total_value?: number;
  status: 'active' | 'completed' | 'archived';
  date?: string;
  created_at?: string;
}

export interface Expense {
  id: string;
  org_id?: string;
  meta_org_id?: string | null;
  category: 'structural' | 'software' | 'distribution' | 'operations' | 'other';
  amount: number;
  date: string;
  workspace_id?: string;
  status?: 'active' | 'completed' | 'archived';
  created_at?: string;
}

export interface Workspace {
  id: string;
  date: string;
  location?: string;
  status: 'active' | 'completed' | 'archived';
  created_at?: string;
  name?: string;
  
  // Workspace Details
  workspace_mode?: 'value' | 'high_intensity';
  activity_category?: string;
  channel?: string;
  org_code?: string;
  
  // Operations
  org_id: string;
  assigned_operator_id?: string;
  operational_contribution?: number;
  channel_value?: number;
  
  // Timing & Distribution
  start_time?: string;
  end_time?: string;
  activity_rate?: number;
}

export interface Entry {
  id: string;
  workspace_id: string;
  entity_id: string;
  input_amount: number;
  output_amount: number;
  net: number;
  created_at?: string;
  
  joined_at?: string;
  left_at?: string;
  
  // Workspace Position
  position_id?: number;

  // Operational metrics
  activity_count?: number;
  
  // Rank/Sort
  sort_order?: number;

  // Transfer tracking
  transfer_method?: string; // links to a channel TransferAccount
}

export interface Adjustment {
  id: string;
  entity_id: string;
  amount: number; 
  type: 'input' | 'output';
  date: string;
  created_at?: string;
}

export interface AdjustmentRequest {
  id: string;
  entity_id: string;
  amount: number;
  type: 'input' | 'output';
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  resolved_at?: string;
  resolved_by?: string;
  created_at?: string;
}

export interface ChannelEntry {
  id: string;
  amount: number;
  type: 'increment' | 'decrement';
  method: string;
  date: string;
  operation_type?: 'manual' | 'transfer';
  transfer_id?: string;
  counterparty_method?: string;
  created_at?: string;
}

export interface EntityAccountEntry {
  id: string;
  org_id?: string;
  meta_org_id?: string | null;
  entity_id: string;
  type: 'increment' | 'adjustment' | 'decrement';
  amount: number;
  date: string;
  request_id?: string;
  transfer_method?: string; // links to a channel TransferAccount
  created_at?: string;
}

export interface OutputRequest {
  id: string;
  entity_id: string;
  amount: number;
  workspace_id?: string;
  method?: string;
  details?: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  resolved_at?: string;
  resolved_by?: string;
  created_at?: string;
}



export interface Associate {
  id: string;
  name: string;
  role: 'associate' | 'partner' | 'channel' | 'hybrid';
  allocation_factor?: number;
  overhead_weight?: number;
  partner_arrangement_rate?: number;
  system_allocation_percent?: number;
  total?: number;
  total_number: number; 
  status: 'active' | 'inactive';
  created_at?: string;
}

export interface AssociateAllocation {
  id: string;
  attributed_associate_id: string;
  associate_id?: string;
  partner_id?: string;
  amount: number;
  type: 'input' | 'alignment' | 'output' | 'adjustment';
  date: string;
  created_at?: string;
}

export interface SystemEvent {
  id: string;
  timestamp: string;
  actor_user_id?: string;
  actor_label?: string;
  operator_activity_id?: string;
  actor_role: 'admin' | 'operator' | 'viewer';
  action: string;
  entity: 'workspace' | 'entries' | 'expense' | 'adjustment' | 'channel' | 'activity' | 'operator' | 'entity' | 'member' | 'activity_log' | 'access_request' | 'partner' | 'partner_entry' | 'associate' | 'associate_allocation' | 'entity_account_entry' | 'log';
  entity_id?: string;
  amount?: number;
  details?: string;
}

export interface OperatorLog {
  id: string;
  org_id?: string;
  actor_user_id: string;
  actor_role: 'admin' | 'operator' | 'viewer';
  actor_label: string;
  started_at: string;
  last_active_at: string;
  ended_at?: string;
  duration_seconds: number;
  is_active: boolean;
  created_at?: string;
}

export interface WorkspaceEntity extends Entry {
  entity_name: string;
}

export interface TransferAccount {
  id: string;
  name: string;        // e.g. "Operating Account", "Wise EUR", "Main Clearing"
  category: string;    // e.g. "bank_account", "wise", "internal transfer" - free-form, not an enum
  is_active: boolean;
  status?: 'active' | 'archived';
  created_at?: string;
}
