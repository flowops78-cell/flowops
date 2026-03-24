# Flow Ops Structural Blueprint

Based on `supabase/migrations/20260327000000_baseline_schema.sql`, this document describes the canonical hard-reset backend structure.

### 1) Governance and Access
`clusters`, `organizations`, `cluster_memberships`, `organization_memberships`, `profiles`, and `platform_roles` define tenant structure and access. Row-level security is derived only from organization membership and cluster membership helpers.

### 2) Activity Domain
`activities` replace workspaces as the top-level operational container. `records` replace entries and capture directional unit changes against an activity and optionally an entity.

### 3) Entity Domain
`entities` replace units as the persistent org-scoped domain object. They can reference a primary `collaboration`, another source `entity`, and a referring `collaboration` while maintaining a running `total_units` balance.

### 4) Collaboration Domain
`collaborations` replace associates and carry the final typed relationship model through `collaboration_type`, `participation_factor`, `overhead_weight_pct`, and structured `rules`.

### 5) Team and Channel Domain
`team_members` replace members for org-scoped staffing records. `channels` replace transfer accounts, and `channel_records` replace channel entries to link channel activity back to the canonical record stream.

### 6) Operational Observability
`operator_activities`, `audit_events`, `access_requests`, and `access_invites` remain as supporting operational and access-control tables. `audit_events` now use `entity_id` instead of any unit-based reference.
