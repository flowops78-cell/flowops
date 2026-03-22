export interface Unit {
  id: string;
  name: string;
  tags?: string[];
  total?: number;
  created_at?: string;
  referred_by_partner_id?: string;
  
  // Real-time stats (cached)
  last_active_at?: string;
  total_input?: number;
  total_net?: number;
}

export interface Member {
  id: string;
  name: string;
  member_id?: string;
  user_id?: string;
  role: 'operator' | 'viewer' | 'admin';
  arrangement_type?: 'hourly' | 'monthly' | 'none';
  service_rate?: number;
  retainer_rate?: number;
  status: 'active' | 'completed' | 'archived';
  tags?: string[];
  created_at?: string;
}

export interface ActivityLog {
  id: string;
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
  assigned_operator_id?: string;
  operational_contribution?: number;
  reserve_value?: number;
  
  // Timing & Distribution
  start_time?: string;
  end_time?: string;
  activity_rate?: number;
}

export interface Entry {
  id: string;
  workspace_id: string;
  unit_id: string;
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
  unit_id: string;
  amount: number; 
  type: 'input' | 'output';
  date: string;
  created_at?: string;
}

export interface AdjustmentRequest {
  id: string;
  unit_id: string;
  amount: number;
  type: 'input' | 'output';
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  resolved_at?: string;
  resolved_by?: string;
  created_at?: string;
}

export interface ReserveEntry {
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

export interface UnitAccountEntry {
  id: string;
  unit_id: string;
  type: 'increment' | 'adjustment' | 'decrement';
  amount: number;
  date: string;
  request_id?: string;
  transfer_method?: string; // links to a channel TransferAccount
  created_at?: string;
}

export interface OutputRequest {
  id: string;
  unit_id: string;
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



export interface Partner {
  id: string;
  name: string;
  role: 'partner' | 'channel' | 'hybrid';
  partner_arrangement_rate?: number;
  system_allocation_percent?: number;
  total: number; // Positive: Entity owes workspace. Negative: Workspace owes entity.
  status: 'active' | 'inactive';
  created_at?: string;
}

export interface PartnerEntry {
  id: string;
  partner_id: string;
  amount: number;
  type: 'input' | 'closure' | 'output' | 'adjustment';
  // input: value comes into system via entity (entity total +)
  // closure: value closed back to system (entity total -)
  // output: value goes from system to unit (entity total -)
  // adjustment: value adjustment reducing entity total (entity total -)
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
  entity: 'workspace' | 'entries' | 'expense' | 'adjustment' | 'reserve' | 'activity' | 'operator' | 'unit' | 'member' | 'activity_log' | 'access_request' | 'partner' | 'partner_entry' | 'unit_account_entry' | 'log';
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

export interface WorkspaceUnit extends Entry {
  unit_name: string;
}

export interface TransferAccount {
  id: string;
  name: string;        // e.g. "Operating Account", "Wise EUR", "Main Clearing"
  category: string;    // e.g. "bank_account", "wise", "internal transfer" - free-form, not an enum
  is_active: boolean;
  status?: 'active' | 'archived';
  created_at?: string;
}
