// Flow Ops — neutral operational vocabulary. Permanently locked. No toggle.

export const LABELS = {
	workspace: 'Workspace',
	group: 'Group',
	currentWorkspace: 'Current workspace',
	roles: {
		groupManager: 'Group admin',
		groupOperator: 'Group manager',
		workspaceAdmin: 'Workspace admin',
		workspaceManager: 'Workspace manager',
		viewer: 'Viewer',
	},
	actions: {
		chooseWorkspace: 'Choose workspace',
		chooseGroup: 'Choose group',
		loadingWorkspace: 'Loading your workspace...',
	},
	states: {
		noWorkspace: 'No workspace selected',
		awaitingAccess: 'You need workspace access',
		/** Shown on the waiting screen — avoid “group manager” alone; in-app that label means cluster operator, not the person who grants org access. */
		awaitingAccessNextSteps: 'Ask an admin to add you in Settings, then use Check status.',
		awaitingAccessFooter: '',
	},
	/**
	 * Keep these distinct from each other and from Settings → Export → Audit trail (exportable `audit_events`).
	 */
	workspacePanels: {
		workspaceHealth: {
			title: 'Workspace health',
			subtitle: '',
			titleHint: 'Workspace integrity',
			sections: {
				integrityIssues: 'Integrity issues',
				snapshot: 'Workspace snapshot',
				watchlist: 'Watchlist',
				recentAttributedActions: 'Recent attributed actions',
			},
			empty: {
				noIntegrityIssues: 'None',
				noWatchlistItems: 'None',
				noAttributedActions: 'None',
			},
		},
		sessionTimeline: {
			title: 'Session timeline',
			subtitle: '',
			titleHint: 'This activity',
		},
	},
	/**
	 * Activity detail → Options modal: assignment (`assigned_user_id`) vs timed `operator_activities` shifts.
	 */
	activityAdvanced: {
		toolbarButton: 'Options',
		modalTitle: 'Options',
		modalSubtitle: '',
		statusSectionTitle: 'Status',
		statusSectionHint: '',
		assignmentSectionTitle: 'Assignee',
		assignmentFieldLabel: 'Assignee',
		assignmentFieldHint: '',
		assignmentPlaceholder: '—',
		assignmentSaveHint: '',
		startNewShiftGroupLabel: '',
		shiftsSectionTitle: 'Shifts',
		shiftsSectionHint: '',
		shiftsSelectPlaceholder: 'Member',
		startShift: 'Start shift',
		noShiftsYet: '',
		endShift: 'End shift',
		shiftsCountSingular: 'shift',
		shiftsCountPlural: 'shifts',
		shiftsActiveNow: 'active now',
	},
	entityHistory: {
		operationsOnEntity: 'Operations on this entity',
	},
} as const;

export const getRoleLabel = (role: string | null | undefined): string => {
	switch (role) {
		case 'cluster_admin':
			return LABELS.roles.groupManager;
		case 'cluster_operator':
			return LABELS.roles.groupOperator;
		case 'admin':
			return LABELS.roles.workspaceAdmin;
		case 'operator':
			return LABELS.roles.workspaceManager;
		case 'viewer':
			return LABELS.roles.viewer;
		default:
			return role ? role.charAt(0).toUpperCase() + role.slice(1) : LABELS.roles.viewer;
	}
};

export const getIdentityTypeLabel = (type: 'cluster' | 'org'): string => {
	return type === 'cluster' ? LABELS.group : LABELS.workspace;
};

export const getUnnamedIdentityLabel = (type: 'cluster' | 'org'): string => {
	return `Unnamed ${getIdentityTypeLabel(type)}`;
};

const applyMatchCase = (match: string, replacement: string): string => {
	if (match === match.toUpperCase()) return replacement.toUpperCase();
	if (match[0] === match[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
	return replacement;
};

const replaceWordVariant = (text: string, pattern: RegExp, singular: string, plural: string): string => {
	return text.replace(pattern, (match) => {
		const replacement = match.toLowerCase().endsWith('s') ? plural : singular;
		return applyMatchCase(match, replacement);
	});
};

export const sanitizeLabel = (text: string): string => {
	let sanitized = text;

	const phraseReplacements = [
		{ pattern: /\borganization contexts?\b/gi, replacement: 'workspace' },
		{ pattern: /\borg contexts?\b/gi, replacement: 'workspace' },
		{ pattern: /\bcluster contexts?\b/gi, replacement: 'group' },
		{ pattern: /\borganization scopes?\b/gi, replacement: 'workspace' },
		{ pattern: /\borg scopes?\b/gi, replacement: 'workspace' },
		{ pattern: /\bcluster scopes?\b/gi, replacement: 'group' },
	];

	for (const { pattern, replacement } of phraseReplacements) {
		sanitized = sanitized.replace(pattern, (match) => applyMatchCase(match, replacement));
	}

	sanitized = replaceWordVariant(sanitized, /\borganizations?\b/gi, 'workspace', 'workspaces');
	sanitized = replaceWordVariant(sanitized, /\bclusters?\b/gi, 'group', 'groups');
	sanitized = sanitized.replace(/\bcontexts?\b/gi, '');
	sanitized = sanitized.replace(/\bscopes?\b/gi, '');

	return sanitized
		.replace(/\s{2,}/g, ' ')
		.replace(/\s+([,.:;!?])/g, '$1')
		.replace(/\(\s*\)/g, '')
		.trim();
};

/** Auto-badges on the entities table (derived from balances, not stored entity tags). */
export const ENTITY_STAT_BADGES = {
	/** Shown when applied record count exceeds the threshold (ledger history). */
	manyRecords: 'Many records',
	/** Shown when net balance exceeds the threshold (includes starting total on workspace ledger). */
	highNetBalance: 'High net balance',
} as const;

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
	manageActivities: 'Open',
	startActivity: 'New record',
	addEntity: 'Add entity',
	recordDeferredActivityRecord: 'Pending',
	viewAll: 'View all',
	recordInput: 'Inflow',
	recordOutput: 'Outflow',
} as const;

export const EVENT_LABELS: Record<string, string> = {
	outflow_added: 'Cost logged',
	record_added: 'Record added',
	activity_record_added: 'Record added',
	// Audit `action` values may still use teamMember_* — labels match UI “roster profile”.
	teamMember_added: 'Roster profile added',
	teamMember_imported: 'Roster profiles imported',
	teamMember_updated: 'Roster profile updated',
	teamMember_deleted: 'Roster profile removed',
	activity_created: 'Activity created',
	activity_deleted: 'Activity deleted',
	operator_session_started: 'Session started',
	log_started: 'Log opened',
	log_ended: 'Log closed',
	log_updated: 'Log updated',
	unit_added: 'Entity added',
	unit_deleted: 'Entity removed',
	unit_updated: 'Entity updated',
	adjustment_added: 'Pending record added',
	adjustment_updated: 'Pending record updated',
	adjustment_deleted: 'Pending record removed',
	channel_record_added: 'Channel record added',
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
	workspacePanels: LABELS.workspacePanels,
});
