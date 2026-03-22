// Flow Ops — neutral operational vocabulary. Permanently locked. No toggle.

export const METRIC_LABELS = {
	openActivities: 'Open activities',
	activeUnits: 'Active units',
	netTotal: 'Net total',
	recentActivityLogs: 'Recent activities',
	activeSessions: 'Active sessions',
	topUnits: 'Top units',
	peakHours: 'Active hours',
	participants: 'Units',
	activitys: 'Activities',
	activity: 'Activity',
	reserve: 'Channels',
	flow: 'Flow'
} as const;

export const ACTION_LABELS = {
	manageActivities: 'Open activity',
	startActivity: 'New entry',
	addUnit: 'Add unit',
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
	unit_added: 'Unit added',
	unit_deleted: 'Unit removed',
	unit_updated: 'Unit updated',
	adjustment_added: 'Pending entry recorded',
	adjustment_updated: 'Pending entry updated',
	adjustment_deleted: 'Pending entry removed',
	reserve_entry_added: 'Channel entry recorded',
	partner_added: 'Partner added',
	partner_updated: 'Partner updated',
	partner_entry_added: 'Adjustment logged',
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
