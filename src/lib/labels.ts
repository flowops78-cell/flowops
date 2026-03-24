// Flow Ops — neutral operational vocabulary. Permanently locked. No toggle.

export const METRIC_LABELS = {
	openActivities: 'Open activities',
	activeEntitys: 'Active entities',
	netTotal: 'Net total',
	recentActivityLogs: 'Recent activities',
	activeSessions: 'Active sessions',
	topEntitys: 'Top entities',
	peakHours: 'Active hours',
	entities: 'Entities',
	participations: 'Participations',
	activities: 'Activities',
	activity: 'Activity',
	channels: 'Channels',
	flow: 'Flow'
} as const;

export const ACTION_LABELS = {
	manageActivities: 'Open activity',
	startActivity: 'New record',
	addEntity: 'Add entity',
	recordDeferredActivityRecord: 'Add Pending ActivityRecord',
	viewAll: 'View all',
	recordInput: 'ActivityRecord input',
	recordOutput: 'ActivityRecord outflow',
} as const;

export const EVENT_LABELS: Record<string, string> = {
	outflow_added: 'Cost logged',
	record_added: 'ActivityRecord recorded',
	activity_record_added: 'ActivityRecord recorded',
	teamMember_added: 'Team teamMember added',
	teamMember_imported: 'Team teamMembers imported',
	teamMember_updated: 'Team teamMember updated',
	teamMember_deleted: 'Team teamMember removed',
	activity_created: 'Activity created',
	activity_deleted: 'Activity deleted',
	operator_session_started: 'Operator session started',
	log_started: 'Log opened',
	log_ended: 'Log closed',
	log_updated: 'Log updated',
	unit_added: 'Entity added',
	unit_deleted: 'Entity removed',
	unit_updated: 'Entity updated',
	adjustment_added: 'Pending record recorded',
	adjustment_updated: 'Pending record updated',
	adjustment_deleted: 'Pending record removed',
	channel_record_added: 'Channel record recorded',
	// Legacy keys — kept so existing DB audit rows still display correctly
	partner_added: 'Collaboration added',
	partner_updated: 'Collaboration updated',
	partner_record_added: 'Participation logged',
	partner_record_deleted: 'Participation removed',
	// Canonical keys
	collaboration_added: 'Collaboration added',
	collaboration_updated: 'Collaboration updated',
	collaboration_archived: 'Collaboration hidden',
	collaboration_unarchived: 'Collaboration restored',
	collaboration_deleted: 'Collaboration removed',
	collaboration_allocation_added: 'Participation logged',
	collaboration_allocation_deleted: 'Participation removed',
	collaboration_allocation_archived: 'Participation hidden',
	collaboration_allocation_unarchived: 'Participation restored',
};

export const t = (key: string): string => key;
export const tx = (text: string): string => text;

export const getMetricLabel = (key: keyof typeof METRIC_LABELS): string => METRIC_LABELS[key];
export const getActionText = (key: keyof typeof ACTION_LABELS): string => ACTION_LABELS[key];
export const getTelemetryLabel = (key: keyof typeof METRIC_LABELS | keyof typeof ACTION_LABELS): string => {
	if (key in METRIC_LABELS) return METRIC_LABELS[key as keyof typeof METRIC_LABELS];
	return ACTION_LABELS[key as keyof typeof ACTION_LABELS];
};
export const getEventLabel = (eventType: string): string => {
	const match = EVENT_LABELS[eventType as keyof typeof EVENT_LABELS];
	return match ?? eventType.replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase());
};

export const useLabels = () => ({
	t,
	tx,
	getMetricLabel,
	getActionText,
	getTelemetryLabel,
	getEventLabel,
});
