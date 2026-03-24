// Flow Ops — neutral operational vocabulary. Permanently locked. No toggle.

export const METRIC_LABELS = {
	openActivities: 'Open activities',
	activeParticipants: 'Active participants',
	netTotal: 'Net total',
	recentActivityLogs: 'Recent activities',
	activeSessions: 'Active sessions',
	topParticipants: 'Top participants',
	peakHours: 'Active hours',
	participants: 'Participants',
	participations: 'Participations',
	activities: 'Activities',
	activity: 'Activity',
	channels: 'Channels',
	flow: 'Flow'
} as const;

export const ACTION_LABELS = {
	manageActivities: 'Open activity',
	startActivity: 'New entry',
	addParticipant: 'Add participant',
	recordDeferredEntry: 'Add pending entry',
	viewAll: 'View all',
	recordInput: 'Record input',
	recordOutput: 'Record outflow',
} as const;

export const EVENT_LABELS: Record<string, string> = {
	outflow_added: 'Cost logged',
	entry_added: 'Entry recorded',
	workspace_entry_added: 'Entry recorded',
	member_added: 'Team member added',
	member_imported: 'Team members imported',
	member_updated: 'Team member updated',
	member_deleted: 'Team member removed',
	activity_created: 'Activity created',
	activity_deleted: 'Activity deleted',
	workspace_created: 'Activity created',
	workspace_deleted: 'Activity deleted',
	operator_session_started: 'Operator session started',
	log_started: 'Log opened',
	log_ended: 'Log closed',
	log_updated: 'Log updated',
	unit_added: 'Participant added',
	unit_deleted: 'Participant removed',
	unit_updated: 'Participant updated',
	adjustment_added: 'Pending entry recorded',
	adjustment_updated: 'Pending entry updated',
	adjustment_deleted: 'Pending entry removed',
	channel_entry_added: 'Channel entry recorded',
	// Legacy keys — kept so existing DB audit rows still display correctly
	partner_added: 'Collaboration added',
	partner_updated: 'Collaboration updated',
	partner_entry_added: 'Participation logged',
	partner_entry_deleted: 'Participation removed',
	// Canonical keys
	associate_added: 'Collaboration added',
	associate_updated: 'Collaboration updated',
	associate_archived: 'Collaboration hidden',
	associate_unarchived: 'Collaboration restored',
	associate_deleted: 'Collaboration removed',
	associate_allocation_added: 'Participation logged',
	associate_allocation_deleted: 'Participation removed',
	associate_allocation_archived: 'Participation hidden',
	associate_allocation_unarchived: 'Participation restored',
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
