# Flow Ops Structural Blueprint

Based on `supabase/migrations/20260322230000_flow_ops_schema.sql`, this document describes the current database structure. The system is organized into six connected sub-systems:

### 1) The Real-Time Engine (`workspaces`, `entries`, `operator_activities`)
Flow Ops creates isolated, time-boxed operating environments called **Workspaces**. Inside an active Workspace, assigned operators track the live state of **Units** and the ongoing movement of inputs and outputs. Presence and activity are captured through `operator_activities`.

### 2) The Channel Tracking Layer (`channel_entries`, `transfer_accounts`)
This layer tracks where operational value is currently held. `transfer_accounts` stores the available accounts and channels, while `channel_entries` records each channel movement. The result is a complete audit trail for admins.

### 3) Persistent Unit Records (`units`, `unit_account_entries`, `output_requests`)
Units remain persistent records across activities rather than one-time names inside a Workspace. `unit_account_entries` tracks ongoing unit-level adjustments outside an active activity, while `output_requests` manages reviewed output requests in a controlled queue.

### 4) Entity Alignment (`associates`, `associate_allocations`)
The entity subsystem keeps external relationships separate from day-to-day activity operations. `associates` and `associate_allocations` support structured alignment for attribution, shared arrangements, and external channel activity without mixing those records into core activity tracking.

### 5) Team Operations (`members`, `activity_logs`, `expenses`)
The team layer covers member scheduling, activity logs, and overhead records. Team members track their shifts in `activity_logs`, while fixed operating costs are recorded in `expenses`. This gives admins a clean operational view across activity work, member scheduling, and overhead.

### 6) Database-Enforced Access Control (`user_roles`, Row Level Security)
The system is protected at the database layer through a strict three-role hierarchy: **admin**, **operator**, and **viewer**. The frontend cannot bypass these rules. If an account attempts an action outside its permissions, Supabase RLS policies reject the request directly.
