# Flow Ops Structural Blueprint

Based on `supabase/migrations/00000000000000_init_canonical_schema.sql`, this document describes the canonical hard-reset backend structure.

### 1) Governance and Access
`clusters`, `organizations`, `cluster_memberships`, `organization_memberships`, `profiles`, and `platform_roles` define tenant structure and access. Row-level security is derived only from organization membership and cluster membership helpers.

### 2) Activity Domain
`activities` replace workspaces as the top-level operational container. `records` replace entries and capture directional unit changes against an activity and optionally an entity.

### 3) Entity Domain
`entities` replace units as the persistent org-scoped domain object. They can reference a primary collaboration profile, another source `entity`, and a referring collaboration profile. Current balances are derived from the ledger-backed `entity_balances` view rather than a stored running-total column.

### 4) Collaboration Domain
`collaborations` replace associates and now back the Collaboration Network's profile model through `collaboration_type`, `status`, `participation_factor`, `overhead_weight_pct`, and structured `rules`.

### 5) Team and Channel Domain
`team_members` replace members for org-scoped staffing records. `channels` replace transfer accounts, and `channel_records` replace channel entries to link channel activity back to the canonical record stream.

### 6) Operational Observability
`operator_activities`, `audit_events`, `access_requests`, and `access_invites` remain as supporting operational and access-control tables. `audit_events` now use `entity_id` instead of any unit-based reference. The canonical baseline also includes the ledger-backed views `audit_record_ledger`, `entity_balances`, `audit_activity_integrity`, `audit_entity_health`, `audit_channel_integrity`, `audit_org_integrity`, and `audit_record_anomalies`.
