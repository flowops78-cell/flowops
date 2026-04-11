/**
 * Narrow PostgREST selects (avoid select('*')) for smaller payloads and faster JSON decode.
 * Keep in sync with public table/view columns used by the UI.
 */
export const DATA_SELECT = {
  entities:
    'id, org_id, name, collaboration_id, referred_by_entity_id, referring_collaboration_id, starting_total, created_at, updated_at',
  activities:
    'id, org_id, label, date, start_time, status, channel_label, assigned_user_id, activity_mode, created_at, updated_at',
  records:
    'id, org_id, activity_id, entity_id, direction, status, unit_amount, transfer_group_id, notes, channel_label, source_record_id, target_entity_id, position_id, sort_order, left_at, created_at, updated_at',
  /** Same row shape minus position/roster columns — use if DB migration not applied yet. */
  records_no_position:
    'id, org_id, activity_id, entity_id, direction, status, unit_amount, transfer_group_id, notes, channel_label, source_record_id, target_entity_id, created_at, updated_at',
  organization_memberships:
    'id, org_id, user_id, role, status, display_name, account_email, is_default_org, created_at, updated_at',
  /** Same row shape minus `account_email` — use if DB migration not applied yet. */
  organization_memberships_no_account_email:
    'id, org_id, user_id, role, status, display_name, is_default_org, created_at, updated_at',
  collaborations:
    'id, org_id, name, collaboration_type, status, participation_factor, overhead_weight_pct, rules, created_at, updated_at',
  channels: 'id, org_id, name, status, notes, created_at, updated_at',
  audit_events:
    'id, org_id, entity_id, actor_user_id, actor_label, actor_role, action, entity, operator_activity_id, amount, details, created_at',
  operator_activities:
    'id, org_id, actor_user_id, actor_role, actor_label, started_at, last_active_at, ended_at, duration_seconds, is_active, activity_id, created_at',
  entity_balances:
    'id, org_id, name, net, total_inflow, record_count, surplus_count, last_active, avg_duration_hours',
  audit_activity_integrity:
    'org_id, activity_id, activity_label, activity_date, total_records, applied_record_count, open_record_count, total_increase, total_decrease, net_amount, status, last_record_at',
  audit_entity_health:
    'org_id, entity_id, entity_name, total_records, applied_record_count, total_increase, total_decrease, net_amount, status, last_record_at',
  audit_org_integrity:
    'org_id, org_name, total_records, applied_record_count, total_increase, total_decrease, net_amount, broken_activity_count, status',
  audit_channel_integrity:
    'org_id, channel_label, total_records, applied_record_count, total_increase, total_decrease, net_amount, status',
  audit_record_anomalies:
    'anomaly_id, org_id, anomaly_type, severity, activity_id, entity_id, channel_label, affected_count, detail',
} as const;
