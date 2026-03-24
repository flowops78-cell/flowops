import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getSupabase, getSupabaseAccessToken, getUserAuthorityContext, isSupabaseConfigured, SUPABASE_ANON_KEY, supabase } from '../lib/supabase';
import { Entity, Workspace, Entry, Member, ActivityLog, Expense, Adjustment, AdjustmentRequest, ChannelEntry, Associate, AssociateAllocation, SystemEvent, OperatorLog, TransferAccount, UnitAccountEntry, OutputRequest } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { APP_MIN_DATE, isDateOnOrAfter, isValidIsoDate } from '../lib/utils';
import { DbRole, appRoleToDbRole, dbRoleToAppRole } from '../lib/roles';
import { useAppRole } from './AppRoleContext';
import { useAuth } from './AuthContext';
import { isAllowedWorkspaceStatusTransition, normalizeWorkspaceStatus } from '../lib/activityRules';

type NewWorkspaceInput = Omit<Workspace, 'id' | 'created_at' | 'org_id'> & {
  org_id?: string;
};

type ProvisionOrgContextResult = {
  org_id: string;
  meta_org_id: string | null;
  managed_org_ids: string[];
};

interface DataContextType {
  units: Entity[];
  workspaces: Workspace[];
  entries: Entry[];
  members: Member[];
  activityLogs: ActivityLog[];
  expenses: Expense[];
  adjustments: Adjustment[];
  adjustmentRequests: AdjustmentRequest[];
  channelEntries: ChannelEntry[];
  unitAccountEntries: UnitAccountEntry[];
  outputRequests: OutputRequest[];
  transferAccounts: TransferAccount[];
  associates: Associate[];
  associateAllocations: AssociateAllocation[];
  systemEvents: SystemEvent[];
  operatorLogs: OperatorLog[];
  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
  loading: boolean;
  loadingProgress: number;
  isDemoMode: boolean;
  
  // Expense Actions
  addUnit: (entity: Omit<Entity, 'id' | 'created_at'>) => Promise<string>;
  updateUnit: (entity: Entity) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  importUnits: (units: Omit<Entity, 'id' | 'created_at'>[]) => Promise<void>;
  transferUnitTotal: (fromUnitId: string, toUnitId: string, amount: number) => Promise<void>;
  transferChannelValues: (fromMethod: string, toMethod: string, amount: number, date: string) => Promise<string>;
  recordOutputRequest: (unitId: string, amount: number, workspaceId?: string, method?: string, details?: string) => Promise<void>;
  addUnitAccountEntry: (entry: Omit<UnitAccountEntry, 'id' | 'created_at'>) => Promise<UnitAccountEntry>;
  requestOutput: (request: Omit<OutputRequest, 'id' | 'created_at' | 'status'>) => Promise<OutputRequest>;
  resolveOutputRequest: (requestId: string, status: 'approved' | 'rejected') => Promise<void>;
  requestAdjustment: (request: Omit<AdjustmentRequest, 'id' | 'created_at' | 'status'>) => Promise<AdjustmentRequest>;
  resolveAdjustmentRequest: (requestId: string, status: 'approved' | 'rejected') => Promise<void>;
  
  // Workspace Actions
  addWorkspace: (workspace: NewWorkspaceInput) => Promise<string>;
  updateWorkspace: (workspace: Workspace) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  
  // Entries Actions
  addEntry: (entry: Omit<Entry, 'id' | 'created_at' | 'net'>) => Promise<void>;
  updateEntry: (entry: Entry) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;

  // Member Actions
  addMember: (member: Omit<Member, 'id' | 'created_at'>) => Promise<void>;
  updateMember: (member: Member) => Promise<void>;
  importMembers: (members: Omit<Member, 'id' | 'created_at'>[]) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;

  // ActivityLog Actions
  addActivityLog: (log: Omit<ActivityLog, 'id' | 'created_at'>) => Promise<void>;
  updateActivityLog: (log: ActivityLog) => Promise<void>;
  endActivityLog: (id: string, endTime: string, duration: number, pay?: number) => Promise<void>;

  // Expense Actions
  addExpense: (expense: Omit<Expense, 'id' | 'created_at'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  // Adjustment Actions
  addAdjustment: (adjustment: Omit<Adjustment, 'id' | 'created_at'>) => Promise<void>;
  updateAdjustment: (adjustment: Adjustment) => Promise<void>;
  deleteAdjustment: (id: string) => Promise<void>;

  // Channel Actions
  addChannelEntry: (entry: Omit<ChannelEntry, 'id' | 'created_at'>) => Promise<void>;
  deleteChannelEntry: (id: string) => Promise<void>;

  // Transfer Account Actions
  addTransferAccount: (account: Omit<TransferAccount, 'id' | 'created_at'>) => Promise<void>;
  updateTransferAccount: (account: TransferAccount) => Promise<void>;
  deleteTransferAccount: (id: string) => Promise<void>;

  // Associate Actions
  addAssociate: (associate: Omit<Associate, 'id' | 'created_at'>) => Promise<void>;
  updateAssociate: (associate: Associate) => Promise<void>;
  deleteAssociate: (id: string) => Promise<void>;
  addAssociateAllocation: (entry: Omit<AssociateAllocation, 'id' | 'created_at'>) => Promise<void>;
  deleteAssociateAllocation: (id: string) => Promise<void>;

  updateProfileOrgId: (orgId: string | null) => Promise<void>;
  provisionProfileOrgContext: () => Promise<ProvisionOrgContextResult>;
  managedOrgIds: string[];
  metaOrgId: string | null;
  recordSystemEvent: (event: Omit<SystemEvent, 'id' | 'timestamp' | 'actor_role'>) => Promise<void>;

  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);
let lastKnownDataContextValue: DataContextType | undefined;
let hasWarnedDataContextFallback = false;

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [units, setUnits] = useState<Entity[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [adjustmentRequests, setAdjustmentRequests] = useState<AdjustmentRequest[]>([]);
  const [channelEntries, setChannelEntries] = useState<ChannelEntry[]>([]);
  const [unitAccountEntries, setUnitAccountEntries] = useState<UnitAccountEntry[]>([]);
  const [outputRequests, setOutputRequests] = useState<OutputRequest[]>([]);
  const [transferAccounts, setTransferAccounts] = useState<TransferAccount[]>([]);
  const [associates, setAssociates] = useState<Associate[]>([]);
  const [associateAllocations, setAssociateAllocations] = useState<AssociateAllocation[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [operatorLogs, setOperatorLogs] = useState<OperatorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('flow_ops_last_org_id');
  });
  const [activeMetaOrgId, setActiveMetaOrgId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('flow_ops_last_meta_org_id');
  });
  const [authorityResolved, setAuthorityResolved] = useState(false);

  const updateActiveOrgId = (id: string | null) => {
    setActiveOrgId(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('flow_ops_last_org_id', id);
      else localStorage.removeItem('flow_ops_last_org_id');
    }
  };

  const updateActiveMetaOrgId = (id: string | null) => {
    setActiveMetaOrgId(id);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('flow_ops_last_meta_org_id', id);
      else localStorage.removeItem('flow_ops_last_meta_org_id');
    }
  };
  const loadingProgressTimerRef = useRef<number | null>(null);
  const loadingProgressResetTimerRef = useRef<number | null>(null);
  const fetchVersionRef = useRef(0);
  const deferredRefreshVersionRef = useRef(0);
  const opsRefreshVersionRef = useRef(0);
  const opsRefreshDebounceTimerRef = useRef<number | null>(null);
  const opsRefreshInFlightRef = useRef(false);
  const opsRefreshQueuedRef = useRef(false);
  const activeFetchCountRef = useRef(0);
  const currentOperatorLogIdRef = useRef<string | null>(null);
  const currentOperatorLogStartedAtRef = useRef<string | null>(null);
  const warnedRuntimeIssuesRef = useRef<Set<string>>(new Set());
  const auditEventsUnavailableRef = useRef(false);
  const outputRequestsUnavailableRef = useRef(false);
  const operatorLogsUnavailableRef = useRef(false);
  const profilesUnavailableRef = useRef(false);
  const missingWorkspacesRef = useRef<Set<string>>(new Set());
  const unitPartnerColumnUnavailableRef = useRef(false);
  const entriesActivityEntitiesColumnUnavailableRef = useRef(false);
  const entriesUnavailableColumnsRef = useRef<Set<string>>(new Set());

  const [managedOrgIds, setManagedOrgIds] = useState<string[]>([]);
  const { role, loading: roleLoading, canAccessAdminUi, canOperateLog, canManageValue, canAlign } = useAppRole();
  const { user, loading: authLoading } = useAuth();

  const isDemoMode = !isSupabaseConfigured;
  const AUDIT_EVENTS_KEY = 'flow_ops_audit_events_v2';
  const UNIT_ACCOUNT_TX_KEY = 'flow_ops_unit_account_entries_v1';
  const OUTFLOW_REQUESTS_KEY = 'flow_ops_output_requests_v1';
  const ADJUSTMENT_REQUESTS_KEY = 'flow_ops_adjustment_requests_v1';
  const OPERATOR_LOG_ID_KEY = 'flow_ops_operator_log_id';
  const OPERATOR_LOG_STARTED_AT_KEY = 'flow_ops_operator_log_started_at';
  const OPERATOR_LOG_USER_ID_KEY = 'flow_ops_operator_log_user_id';
  const OPERATOR_ACTIVITY_WORKSPACE = 'operator_activities';
  const LEGACY_OPERATOR_ACTIVITY_WORKSPACE = 'operator_logs';

  const readMissingWorkspaceCache = () => new Set<string>();

  const persistMissingWorkspaceCache = () => {};

  const clearLoadingProgressTimers = () => {
    if (loadingProgressTimerRef.current !== null) {
      window.clearInterval(loadingProgressTimerRef.current);
      loadingProgressTimerRef.current = null;
    }
    if (loadingProgressResetTimerRef.current !== null) {
      window.clearTimeout(loadingProgressResetTimerRef.current);
      loadingProgressResetTimerRef.current = null;
    }
  };

  const beginLoadingProgress = () => {
    activeFetchCountRef.current += 1;
    if (activeFetchCountRef.current > 1) return;

    clearLoadingProgressTimers();
    setLoadingProgress(8);
    let progress = 8;
    loadingProgressTimerRef.current = window.setInterval(() => {
      progress = Math.min(progress + (progress < 70 ? 9 : progress < 90 ? 4 : 1), 92);
      setLoadingProgress(progress);
    }, 120);
  };

  const completeLoadingProgress = () => {
    activeFetchCountRef.current = Math.max(0, activeFetchCountRef.current - 1);
    if (activeFetchCountRef.current > 0) return;

    clearLoadingProgressTimers();
    setLoadingProgress(100);
    loadingProgressResetTimerRef.current = window.setTimeout(() => {
      setLoadingProgress(0);
      loadingProgressResetTimerRef.current = null;
    }, 320);
  };

  const markMissingWorkspace = (workspaceName: string) => {
    if (missingWorkspacesRef.current.has(workspaceName)) return;
    missingWorkspacesRef.current.add(workspaceName);
    persistMissingWorkspaceCache();

    if (workspaceName === 'output_requests') outputRequestsUnavailableRef.current = true;
    if (workspaceName === OPERATOR_ACTIVITY_WORKSPACE || workspaceName === LEGACY_OPERATOR_ACTIVITY_WORKSPACE) {
      operatorLogsUnavailableRef.current = true;
    }
  };

  const hasMissingWorkspace = (workspaceName: string) => missingWorkspacesRef.current.has(workspaceName);

  useEffect(() => {
    const cached = readMissingWorkspaceCache();
    missingWorkspacesRef.current = cached;
    profilesUnavailableRef.current = cached.has('profiles');
    auditEventsUnavailableRef.current = cached.has('audit_events');
    outputRequestsUnavailableRef.current = cached.has('output_requests');
    operatorLogsUnavailableRef.current = cached.has(OPERATOR_ACTIVITY_WORKSPACE) || cached.has(LEGACY_OPERATOR_ACTIVITY_WORKSPACE);
  }, []);

  useEffect(() => () => {
    clearLoadingProgressTimers();
    if (opsRefreshDebounceTimerRef.current !== null) {
      window.clearTimeout(opsRefreshDebounceTimerRef.current);
      opsRefreshDebounceTimerRef.current = null;
    }
  }, []);

  const resolveOperatorUsername = () => {
    if (role === 'operator') {
      const currentMemberId = members.find((member) => member.user_id === user?.id)?.member_id;
      if (currentMemberId) return currentMemberId;
    }
    const displayName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : null;
    return (displayName && displayName.trim()) || role || 'active-user';
  };

  const readOperatorSessionValue = (key: string) => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  };

  const writeOperatorSessionValue = (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(key, value);
    localStorage.removeItem(key);
  };

  const warnOnce = (key: string, message: string, detail?: string) => {
    if (warnedRuntimeIssuesRef.current.has(key)) return;
    warnedRuntimeIssuesRef.current.add(key);
    if (detail) {
      console.warn(message, detail);
      return;
    }
    console.warn(message);
  };

  const isMissingWorkspaceError = (error: { code?: string | null; message?: string | null } | null | undefined, workspaceName: string) => {
    const code = error?.code ?? '';
    const message = (error?.message ?? '').toLowerCase();
    return code === 'PGRST205' || message.includes(`public.${workspaceName}`) || (message.includes('could not find the workspace') && message.includes(workspaceName));
  };

  const isMissingColumnError = (
    error: { code?: string | null; message?: string | null } | null | undefined,
    workspaceName: string,
    columnName: string,
  ) => {
    const code = error?.code ?? '';
    const message = (error?.message ?? '').toLowerCase();
    const columnMentioned = message.includes(columnName.toLowerCase());
    const workspaceMentioned = message.includes(workspaceName.toLowerCase());
    const schemaCacheMentioned = message.includes('schema cache');
    return (code === 'PGRST204' || schemaCacheMentioned) && columnMentioned && (workspaceMentioned || schemaCacheMentioned);
  };

  const extractMissingColumnName = (
    error: { code?: string | null; message?: string | null } | null | undefined,
    workspaceName: string,
  ) => {
    const message = error?.message ?? '';
    const normalized = message.toLowerCase();
    const code = error?.code ?? '';

    if (code !== 'PGRST204' && !normalized.includes('column') && !normalized.includes('schema cache')) {
      return null;
    }

    const schemaCacheMatch = message.match(/could not find the '([^']+)' column of '([^']+)'/i);
    if (schemaCacheMatch) {
      const [, columnName, matchedWorkspace] = schemaCacheMatch;
      if (matchedWorkspace?.toLowerCase() === workspaceName.toLowerCase()) {
        return columnName.toLowerCase();
      }
    }

    const pgMissingMatch = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of relation\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i);
    if (pgMissingMatch) {
      const [, columnName, matchedWorkspace] = pgMissingMatch;
      if (matchedWorkspace?.toLowerCase() === workspaceName.toLowerCase()) {
        return columnName.toLowerCase();
      }
    }

    return null;
  };

  const markEntriesColumnUnavailable = (columnName: string) => {
    if (!columnName) return;
    if (entriesUnavailableColumnsRef.current.has(columnName)) return;
    entriesUnavailableColumnsRef.current.add(columnName);
    if (columnName === 'activity_units') {
      if (!entriesActivityEntitiesColumnUnavailableRef.current) {
        entriesActivityEntitiesColumnUnavailableRef.current = true;
      }
    }
    warnOnce(
      `missing-entries-column-${columnName}`,
      `Supabase entries.${columnName} column is missing. Entries writes will continue without that column until migration is applied.`,
    );
  };

  const stripUnavailableEntriesColumns = <T extends Record<string, unknown>>(payload: T): T => {
    const next = { ...payload } as Record<string, unknown>;

    entriesUnavailableColumnsRef.current.forEach((columnName) => {
      if (columnName in next) {
        delete next[columnName];
      }
    });

    if (entriesActivityEntitiesColumnUnavailableRef.current && 'activity_units' in next) {
      delete next.activity_units;
    }

    return next as T;
  };

  const isMissingFunctionError = (error: { code?: string | null; message?: string | null } | null | undefined, functionName: string) => {
    const code = error?.code ?? '';
    const message = (error?.message ?? '').toLowerCase();
    return code === 'PGRST202' || (message.includes('function') && message.includes(functionName.toLowerCase()));
  };

  const requireNonEmpty = (value: string | undefined, field: string) => {
    if (!value || !value.trim()) throw new Error(`${field} is required.`);
    return value.trim();
  };

  const FREEFORM_AUDIT_DETAIL_MAX_LENGTH = 120;

  const minimizeFreeformText = (value: string, maxLength: number) => {
    const collapsed = value.replace(/\s+/g, ' ').trim();
    if (!collapsed) return '';

    const redacted = collapsed
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-login]')
      .replace(/(?<!\w)(?:\+?\d[\d\s().-]{6,}\d)(?!\w)/g, '[redacted-number]')
      .replace(/(^|[\s(])@[a-z0-9_]{3,}(?=$|[\s).,;:!?])/gi, (_match, prefix: string) => `${prefix}[redacted-handle]`);

    if (redacted.length <= maxLength) return redacted;
    return `${redacted.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  };

  const sanitizeOptionalFreeformText = (value: string | null | undefined, maxLength: number) => {
    if (!value || !value.trim()) return undefined;
    const minimized = minimizeFreeformText(value, maxLength);
    return minimized || undefined;
  };

  const requirePositiveAmount = (value: number, field: string) => {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be greater than 0.`);
    return value;
  };

  const requireNonNegativeAmount = (value: number, field: string) => {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${field} cannot be negative.`);
    return value;
  };

  const requireMinimumAmount = (value: number, field: string, minimum: number) => {
    if (!Number.isFinite(value) || value < minimum) throw new Error(`${field} must be at least ${minimum}.`);
    return value;
  };

  const requireValidDate = (value: string, field: string) => {
    if (!isValidIsoDate(value)) throw new Error(`${field} must be a valid date in YYYY-MM-DD format.`);
    if (!isDateOnOrAfter(value, APP_MIN_DATE)) throw new Error(`${field} cannot be earlier than ${APP_MIN_DATE}.`);
    return value;
  };

  const normalizeOrgCode = (value?: string) => {
    const alphaNumeric = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    return alphaNumeric ? `#${alphaNumeric}` : undefined;
  };

  const requireValidOrgCode = (value?: string) => {
    if (!value || !value.trim()) return undefined;
    const normalized = normalizeOrgCode(value);
    if (!normalized || !/^#[A-Z0-9]{5}$/.test(normalized)) {
      throw new Error('Org code must use format #A1B2C.');
    }
    return normalized;
  };

  const requirePermission = (allowed: boolean, message: string) => {
    if (!allowed) throw new Error(message);
  };

  const requireOrgScope = (): string => {
    if (isDemoMode) {
      const demoOrgId = activeOrgId ?? crypto.randomUUID();
      if (!activeOrgId) {
        setActiveOrgId(demoOrgId);
      }
      return demoOrgId;
    }
    if (!activeOrgId) {
      if (role === 'admin') {
        throw new Error('As an administrator, you must select an organization context before performing this action. Use the organization switcher to set a target scope.');
      }
      throw new Error('Account is not assigned to an organization. Set profiles.org_id and sign in again.');
    }
    return activeOrgId;
  };

  const normalizeSupabaseWriteError = (error: { code?: string | null; message?: string | null; status?: number } | null | undefined) => {
    const status = typeof error?.status === 'number' ? error.status : undefined;
    const message = (error?.message ?? '').toLowerCase();
    if (status === 401 || status === 403 || message.includes('jwt') || message.includes('permission denied')) {
      return new Error('Activity expired or access denied. Please sign out and sign in again.');
    }
    if (message.includes('row-level security') || message.includes('policy')) {
      return new Error('Action blocked by row-level security policy. Ensure your profile has the correct organization assignment.');
    }
    return error;
  };

  const recordSystemEvent = async (event: Omit<SystemEvent, 'id' | 'timestamp' | 'actor_role'>) => {
    const actorLabel = resolveOperatorUsername();
    const operatorActivityId = currentOperatorLogIdRef.current ?? undefined;
    const sanitizedDetails = sanitizeOptionalFreeformText(event.details, FREEFORM_AUDIT_DETAIL_MAX_LENGTH);

    const pushLocalEvent = (id: string) => {
      const fullEvent: SystemEvent = {
        id,
        timestamp: new Date().toISOString(),
        actor_user_id: user?.id,
        actor_label: actorLabel,
        operator_activity_id: operatorActivityId,
        actor_role: role,
        ...event,
        details: sanitizedDetails,
      };

      setSystemEvents(prev => {
        const updated = [fullEvent, ...prev].slice(0, 1000);
        if (isDemoMode) {
          localStorage.setItem(AUDIT_EVENTS_KEY, JSON.stringify(updated));
        }
        return updated;
      });
    };

    if (isDemoMode || !supabase) {
      pushLocalEvent(uuidv4());
      return;
    }
    if (auditEventsUnavailableRef.current || !user || !activeOrgId) return;

    const rpcResult = await supabase.rpc('log_audit_event', {
      p_action: event.action,
      p_entity: event.entity,
      p_unit_id: event.unit_id ?? null,
      p_amount: event.amount ?? null,
      p_details: sanitizedDetails ?? null,
      p_actor_label: actorLabel,
      p_operator_activity_id: operatorActivityId ?? null,
    });

    if (!rpcResult.error) {
      pushLocalEvent(typeof rpcResult.data === 'string' ? rpcResult.data : uuidv4());
      return;
    }

    if (isMissingFunctionError(rpcResult.error, 'log_audit_event')) {
      auditEventsUnavailableRef.current = true;
      warnOnce(
        'missing-audit-log-rpc',
        'Audit event persistence is disabled until the SQL migration and log_audit_event RPC are deployed.',
        rpcResult.error.message,
      );
      return;
    }

    warnOnce(`audit-write-rpc-${rpcResult.error.code ?? 'unknown'}`, 'Audit event persistence failed.', rpcResult.error.message);
  };

  const registerEntryActivityMismatch = (workspaceId: string) => {
    if (!entriesActivityEntitiesColumnUnavailableRef.current) {
      entriesActivityEntitiesColumnUnavailableRef.current = true;
      warnOnce(
        'missing-entry-entity-id',
        `Supabase entries.unit_id column is missing for workspace ${workspaceId}. Activity logs will continue without entity tracking until migration is applied.`
      );
    }
  };

  const logEntryOutput = async (workspaceId: string, entryId: string) => {
    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const now = new Date().toISOString();
    const { error: logError } = await supabase.from('entries').update({ left_at: now }).eq('id', entryId).eq('org_id', scopedOrgId);
    if (logError) {
      if (isMissingColumnError(logError, 'entries', 'unit_id')) {
        registerEntryActivityMismatch(workspaceId);
        return;
      }
      throw normalizeSupabaseWriteError(logError);
    }
  };
  const isTotaldWorkspace = (workspaceId: string) => {
    const workspaceEntries = entries.filter(entry => entry.workspace_id === workspaceId);
    const totalInflow = workspaceEntries.reduce((sum, entry) => sum + entry.input_amount, 0);
    const totalExpense = workspaceEntries.reduce((sum, entry) => sum + entry.output_amount, 0);
    return Math.abs(totalExpense - totalInflow) < 0.01;
  };

  const requireEntriesMutationAllowed = (workspaceId: string, operation: 'add' | 'update' | 'delete') => {
    const workspace = workspaces.find(item => item.id === workspaceId);
    if (!workspace) throw new Error('Associated workspace was not found.');
    if (workspace.status !== 'active') throw new Error('Only active activities are ediworkspace.');
    if (operation === 'add' && workspace.status !== 'active') throw new Error('Entities can only be added while activity is active.');
  };

  const sanitizeUnitInput = (unitData: Omit<Entity, 'id' | 'created_at'>) => ({
    name: (unitData.name || '').trim(),
    tags: Array.isArray(unitData.tags) ? unitData.tags : [],
    attributed_associate_id: unitData.attributed_associate_id || undefined,
  });

  const stripUnitAssociateColumn = <T extends { attributed_associate_id?: string | undefined; referred_by_partner_id?: string | undefined }>(
    obj: T
  ): Omit<T, 'attributed_associate_id' | 'referred_by_partner_id'> => {
    const { attributed_associate_id, referred_by_partner_id, ...rest } = obj;
    return rest;
  };

  const stripEntriesActivityCountColumn = <T extends { activity_units?: number | undefined }>(
    payload: T,
  ): Omit<T, 'activity_units'> => {
    const { activity_units, ...rest } = payload;
    return rest;
  };

  const sanitizeExpenseInput = (expenseData: Omit<Expense, 'id' | 'created_at'>) => ({
    ...expenseData,
    amount: requirePositiveAmount(expenseData.amount, 'Expense amount'),
    date: requireValidDate(expenseData.date, 'Expense date'),
  });

  const sanitizeAdjustmentInput = (adjustmentData: Omit<Adjustment, 'id' | 'created_at'>) => ({
    ...adjustmentData,
    amount: requirePositiveAmount(adjustmentData.amount, 'Deferred entry amount'),
    date: requireValidDate(adjustmentData.date, 'Deferred entry date'),
  });

  const sanitizeChannelEntryInput = (entryData: Omit<ChannelEntry, 'id' | 'created_at'>) => ({
    ...entryData,
    amount: requirePositiveAmount(entryData.amount, 'Entry amount'),
    date: requireValidDate(entryData.date, 'Entry date'),
    operation_type: entryData.operation_type ?? 'manual',
    transfer_id: entryData.transfer_id?.trim() || undefined,
    counterparty_method: entryData.counterparty_method?.trim() || undefined,
  });

  const sanitizeMemberInput = (memberData: Omit<Member, 'id' | 'created_at'>): Omit<Member, 'id' | 'created_at'> => {
    const resolvedRole = memberData.role === 'operator' || memberData.role === 'viewer' || memberData.role === 'admin'
      ? memberData.role
      : 'viewer';
    const normalized = normalizeMemberArrangement({
      ...memberData,
      name: memberData.name?.trim() ?? '',
      member_id: memberData.member_id?.trim() || undefined,
      role: resolvedRole,
      status: memberData.status ?? 'active',
      tags: memberData.tags?.map(tag => tag.trim()).filter(Boolean),
    } as Member);

    const { id, created_at, ...rest } = normalized;
    return rest as Omit<Member, 'id' | 'created_at'>;
  };

  const sanitizeMemberRecord = (memberData: Member): Member => {
    const resolvedRole = memberData.role === 'operator' || memberData.role === 'viewer' || memberData.role === 'admin'
      ? memberData.role
      : 'viewer';
    const normalized = normalizeMemberArrangement({
      ...memberData,
      name: memberData.name?.trim() ?? '',
      member_id: memberData.member_id?.trim() || undefined,
      role: resolvedRole,
      status: memberData.status ?? 'active',
      tags: memberData.tags?.map(tag => tag.trim()).filter(Boolean),
    });

    return normalized;
  };

  const normalizeAssociateRole = (value: unknown): Associate['role'] => {
    const rawRole = String(value ?? '').trim().toLowerCase();
    // Map all legacy partner-era role names to canonical values
    if (rawRole === 'partner' || rawRole === 'referrer' || rawRole === 'associate') return 'associate';
    if (rawRole === 'channel' || rawRole === 'viewer' || rawRole === 'operator') return 'channel';
    if (rawRole === 'hybrid' || rawRole === 'both') return 'hybrid';
    return 'channel';
  };

  const sanitizeAssociateInput = (associateData: Omit<Associate, 'id' | 'created_at'>) => {
    const allocationFactor = typeof associateData.allocation_factor === 'number' && Number.isFinite(associateData.allocation_factor)
      ? Math.max(0, associateData.allocation_factor)
      : typeof associateData.partner_arrangement_rate === 'number' && Number.isFinite(associateData.partner_arrangement_rate)
        ? Math.max(0, associateData.partner_arrangement_rate)
      : 0;
    const overheadWeight = typeof associateData.overhead_weight === 'number' && Number.isFinite(associateData.overhead_weight)
      ? Math.max(0, associateData.overhead_weight)
      : typeof associateData.system_allocation_percent === 'number' && Number.isFinite(associateData.system_allocation_percent)
        ? Math.max(0, associateData.system_allocation_percent)
      : 0;
    const totalNumber = typeof associateData.total_number === 'number' && Number.isFinite(associateData.total_number)
      ? associateData.total_number
      : typeof associateData.total === 'number' && Number.isFinite(associateData.total)
        ? associateData.total
        : 0;

    return {
      ...associateData,
      name: associateData.name?.trim() ?? '',
      allocation_factor: allocationFactor,
      partner_arrangement_rate: allocationFactor,
      overhead_weight: overheadWeight,
      system_allocation_percent: overheadWeight,
      total: totalNumber,
      total_number: totalNumber,
      role: normalizeAssociateRole(associateData.role),
      status: associateData.status ?? 'active',
    };
  };

  const sanitizeAssociateRecord = (associateData: Associate): Associate => {
    const allocationFactor = typeof associateData.allocation_factor === 'number' && Number.isFinite(associateData.allocation_factor)
      ? Math.max(0, associateData.allocation_factor)
      : typeof associateData.partner_arrangement_rate === 'number' && Number.isFinite(associateData.partner_arrangement_rate)
        ? Math.max(0, associateData.partner_arrangement_rate)
      : 0;
    const overheadWeight = typeof associateData.overhead_weight === 'number' && Number.isFinite(associateData.overhead_weight)
      ? Math.max(0, associateData.overhead_weight)
      : typeof associateData.system_allocation_percent === 'number' && Number.isFinite(associateData.system_allocation_percent)
        ? Math.max(0, associateData.system_allocation_percent)
      : 0;
    const totalNumber = typeof associateData.total_number === 'number' && Number.isFinite(associateData.total_number)
      ? associateData.total_number
      : typeof associateData.total === 'number' && Number.isFinite(associateData.total)
        ? associateData.total
        : 0;

    return {
      ...associateData,
      name: associateData.name?.trim() ?? '',
      allocation_factor: allocationFactor,
      partner_arrangement_rate: allocationFactor,
      overhead_weight: overheadWeight,
      system_allocation_percent: overheadWeight,
      total: totalNumber,
      total_number: totalNumber,
      role: normalizeAssociateRole(associateData.role),
      status: associateData.status ?? 'active',
    } as Associate;
  };

  const normalizeAssociateAllocationType = (value: unknown): AssociateAllocation['type'] => {
    const rawType = String(value ?? '').trim().toLowerCase();
    if (rawType === 'input') return 'input';
    if (rawType === 'alignment' || rawType === 'closure') return 'alignment';
    if (rawType === 'output') return 'output';
    if (rawType === 'adjustment') return 'adjustment';
    return 'input';
  };

  const normalizeAssociateAllocationRecord = (entry: AssociateAllocation): AssociateAllocation => ({
    ...entry,
    // Accept both column names from DB rows to ease migration
    attributed_associate_id: (entry as any).attributed_associate_id ?? (entry as any).associate_id ?? (entry as any).partner_id ?? '',
    type: normalizeAssociateAllocationType(entry.type),
  });

  const sanitizeAssociateAllocationInput = (entryData: Omit<AssociateAllocation, 'id' | 'created_at'>) => ({
    ...entryData,
    attributed_associate_id: (entryData as any).attributed_associate_id ?? (entryData as any).associate_id ?? (entryData as any).partner_id ?? '',
    type: normalizeAssociateAllocationType(entryData.type),
    amount: requirePositiveAmount(entryData.amount, 'Entry amount'),
    date: requireValidDate(entryData.date, 'Associate entry date'),
  });

  const toAssociateWritePayload = (associateData: Omit<Associate, 'id' | 'created_at'> | Associate) => {
    const sanitizedAssociate = 'id' in associateData
      ? sanitizeAssociateRecord(associateData as Associate)
      : sanitizeAssociateInput(associateData);
    const {
      id,
      created_at,
      total_number,
      overhead_weight,
      role,
      ...rest
    } = sanitizedAssociate as Associate;

    return {
      ...rest,
      role: role === 'associate' ? 'partner' : role,
      allocation_factor: sanitizedAssociate.allocation_factor ?? sanitizedAssociate.partner_arrangement_rate ?? 0,
      partner_arrangement_rate: sanitizedAssociate.allocation_factor ?? sanitizedAssociate.partner_arrangement_rate ?? 0,
      system_allocation_percent: overhead_weight ?? sanitizedAssociate.system_allocation_percent ?? 0,
      total: total_number ?? sanitizedAssociate.total ?? 0,
    };
  };

  const toAssociateAllocationWritePayload = (entryData: Omit<AssociateAllocation, 'id' | 'created_at'> | AssociateAllocation) => {
    const sanitizedEntry = sanitizeAssociateAllocationInput(entryData as Omit<AssociateAllocation, 'id' | 'created_at'>);
    const { id: _id, created_at: _ca, attributed_associate_id, ...rest } = sanitizedEntry as AssociateAllocation;
    return {
      ...rest,
      associate_id: attributed_associate_id,
      partner_id: attributed_associate_id,
    };
  };

  const parseStoredJson = <T,>(raw: string | null, key: string): T | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn(`Invalid local storage payload for ${key}. Resetting value.`, error);
      localStorage.removeItem(key);
      return null;
    }
  };

  const normalizeMemberArrangement = (member: Member): Member => {
    const incentiveType = member.arrangement_type ?? 'none';
    const overheadWeight = typeof member.overhead_weight === 'number' && Number.isFinite(member.overhead_weight)
      ? member.overhead_weight
      : typeof member.service_rate === 'number' && Number.isFinite(member.service_rate)
        ? member.service_rate
      : undefined;
    const retainerRate = typeof member.retainer_rate === 'number' && Number.isFinite(member.retainer_rate)
      ? member.retainer_rate
      : undefined;

    return {
      ...member,
      arrangement_type: incentiveType,
      overhead_weight: overheadWeight,
      service_rate: overheadWeight,
      retainer_rate: retainerRate,
    };
  };

  const normalizeWorkspaceLifecycle = (workspace: Workspace): Workspace => {
    return {
      ...workspace,
      operational_contribution: workspace.operational_contribution ?? 0,
      channel_value: workspace.channel_value ?? 0,
      status: normalizeWorkspaceStatus(workspace.status),
    };
  };



  const normalizeWorkspacesLifecycle = (items: Workspace[]) => items.map(normalizeWorkspaceLifecycle);

  const clearScopedDatasets = () => {
    setUnits([]);
    setWorkspaces([]);
    setEntries([]);
    setMembers([]);
    setActivityLogs([]);
    setExpenses([]);
    setAdjustments([]);
    setAdjustmentRequests([]);
    setChannelEntries([]);
    setUnitAccountEntries([]);
    setOutputRequests([]);
    setTransferAccounts([]);
    setAssociates([]);
    setAssociateAllocations([]);
    setSystemEvents([]);
    setOperatorLogs([]);
  };

  const normalizeActivityLogs = (items: ActivityLog[], workspacesScope: Workspace[]) => {
    const workspaceIdSet = new Set(workspacesScope.map(workspace => workspace.id));
    return items.filter(activity => typeof activity.workspace_id === 'string' && activity.workspace_id.length > 0 && workspaceIdSet.has(activity.workspace_id));
  };

  const loadDemoData = () => {
    setLoading(false);
  };

  type QueryResult<T> = {
    data: T[] | null;
    error: { code?: string | null; message?: string | null } | null;
  };

  type AuditEventRow = {
    id: string;
    created_at: string;
    actor_user_id?: string | null;
    actor_label?: string | null;
    actor_role: DbRole;
    action: string;
    entity: SystemEvent['entity'];
    unit_id?: string | null;
    amount?: number | null;
    details?: string | null;
    operator_activity_id?: string | null;
  };

  type OperatorLogRow = Omit<OperatorLog, 'actor_role'> & {
    actor_role: DbRole;
  };

  const queryWorkspace = async <T,>(
    workspaceName: string,
    query: () => PromiseLike<QueryResult<T>>,
  ): Promise<QueryResult<T>> => {
    if (hasMissingWorkspace(workspaceName)) {
      return { data: [] as T[], error: null };
    }

    try {
      const result = await query();
      if (result.error && isMissingWorkspaceError(result.error, workspaceName)) {
        markMissingWorkspace(workspaceName);
      }
      return result;
    } catch (error) {
      warnOnce(`fetch-thrown-${workspaceName}`, `Unable to load ${workspaceName}. Continuing with partial data.`, error instanceof Error ? error.message : String(error));
      return { data: [] as T[], error: null };
    }
  };

  const resolveRows = <T,>(result: QueryResult<T>, workspaceName: string): T[] => {
    if (!result.error) return result.data ?? [];
    if (isMissingWorkspaceError(result.error, workspaceName)) {
      warnOnce(`missing-${workspaceName}`, `Supabase workspace ${workspaceName} is missing. Continuing without it.`, result.error.message ?? undefined);
      if (workspaceName === 'audit_events') auditEventsUnavailableRef.current = true;
      if (workspaceName === OPERATOR_ACTIVITY_WORKSPACE || workspaceName === LEGACY_OPERATOR_ACTIVITY_WORKSPACE) {
        operatorLogsUnavailableRef.current = true;
      }
      return [] as T[];
    }
    warnOnce(`fetch-${workspaceName}-${result.error.code ?? 'unknown'}`, `Unable to load ${workspaceName}. Continuing with partial data.`, result.error.message ?? undefined);
    return [] as T[];
  };

  const mapAuditRowsToSystemEvents = (auditRows: AuditEventRow[]): SystemEvent[] => {
    return auditRows.map((item) => ({
      id: item.id,
      timestamp: item.created_at,
      actor_user_id: item.actor_user_id ?? undefined,
      actor_label: item.actor_label ?? undefined,
      actor_role: dbRoleToAppRole(item.actor_role),
      operator_activity_id: item.operator_activity_id ?? undefined,
      action: item.action,
      entity: item.entity,
      unit_id: item.unit_id ?? undefined,
      amount: item.amount ?? undefined,
      details: item.details ?? undefined,
    }));
  };

  const loadProfileContext = async (): Promise<string | null> => {
    if (!supabase) {
      setAuthorityResolved(true);
      return null;
    }

    let resolvedOrgId: string | null = null;

    if (user) {
      try {
        const authority = await getUserAuthorityContext(user.id);
        if (authority.source === 'none') {
          setAuthorityResolved(true);
          return null;
        }

        updateActiveOrgId(authority.activeOrgId);
        if (authority.managedOrgIds) {
          setManagedOrgIds(authority.managedOrgIds);
        }
        if (authority.metaOrgId) {
          setActiveMetaOrgId(authority.metaOrgId);
        }
        setAuthorityResolved(true);
        return authority.activeOrgId;
      } catch (err) {
        console.error("Error getting user authority context:", err);
        setAuthorityResolved(true);
        return null;
      }
    }

    // Fallback to profiles table if authority context not resolved or user is null
    if (user && !profilesUnavailableRef.current && !hasMissingWorkspace('profiles')) {
      const { data: profileRelData, error: profileRelError } = await supabase
        .from('profiles')
        .select('org_id, meta_org_id')
        .eq('id', (user as any).id)
        .single();

      if (profileRelError) {
        const errorCode = profileRelError.code ?? '';
        const errorMessage = profileRelError.message?.toLowerCase() ?? '';
        const missingProfilesRelation = errorCode === 'PGRST205' || errorMessage.includes('profiles');
        const missingProfileRow = errorCode === 'PGRST116';

        if (missingProfilesRelation) {
          markMissingWorkspace('profiles');
          warnOnce('missing-profiles', 'Supabase profiles workspace is missing. Run supabase/migrations/20260322230000_flow_ops_schema.sql to enable full auth + organization scoping. Continuing with default fetch mode.', profileRelError.message);
          resolvedOrgId = null;
          setActiveOrgId(null);
        } else if (missingProfileRow) {
          warnOnce('missing-profile-row', 'No profile row found for authenticated user. Set up profile/organization assignment to enable scoped access.', profileRelError.message);
          resolvedOrgId = null;
          setActiveOrgId(null);
        } else {
          warnOnce(`profile-fetch-${profileRelError.code ?? 'unknown'}`, 'Unable to load profile context. Continuing with default fetch mode.', profileRelError.message);
          resolvedOrgId = null;
          setActiveOrgId(null);
        }
      } else {
        resolvedOrgId = profileRelData?.org_id ?? null;
        setActiveOrgId(resolvedOrgId);
        setActiveMetaOrgId(profileRelData?.meta_org_id ?? null);
        setManagedOrgIds(resolvedOrgId ? [resolvedOrgId] : []);
        
        // Cache for faster next load
        if (typeof window !== 'undefined') {
          if (resolvedOrgId) localStorage.setItem('flow_ops_last_org_id', resolvedOrgId);
          else localStorage.removeItem('flow_ops_last_org_id');
          if (profileRelData?.meta_org_id) localStorage.setItem('flow_ops_last_meta_org_id', profileRelData.meta_org_id);
          else localStorage.removeItem('flow_ops_last_meta_org_id');
        }
      }
    } else {
      resolvedOrgId = null;
      setActiveOrgId(null);
      setManagedOrgIds([]);
    }
    setAuthorityResolved(true);
    return resolvedOrgId;
  };

  const refreshDeferredDatasets = async (expectedFetchVersion?: number) => {
    const client = supabase;
    if (isDemoMode || !client) return;

    const requestVersion = ++deferredRefreshVersionRef.current;
    try {
      const [
        activityLogsRes,
        expensesRes,
        adjustmentsRes,
        adjustmentRequestsRes,
        channelEntriesRes,
        unitAccountEntriesRes,
        outputRequestsRes,
        associatesRes,
        associateAllocationsRes,
        transferAccountsRes,
      ] = await Promise.all([
        queryWorkspace<ActivityLog>('activity_logs', () => client.from('activity_logs').select('*').order('start_time', { ascending: false })),
        queryWorkspace<Expense>('expenses', () => client.from('expenses').select('*').order('date', { ascending: false })),
        queryWorkspace<Adjustment>('adjustments', () => client.from('adjustments').select('*').order('date', { ascending: false })),
        queryWorkspace<AdjustmentRequest>('adjustment_requests', () => client.from('adjustment_requests').select('*').order('requested_at', { ascending: false })),
        queryWorkspace<ChannelEntry>('channel_entries', () => client.from('channel_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<UnitAccountEntry>('unit_account_entrys', () => client.from('unit_account_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<OutputRequest>('output_requests', () => client.from('output_requests').select('*').order('requested_at', { ascending: false })),
        queryWorkspace<Associate>('associates', () => client.from('associates').select('*').order('name')),
        queryWorkspace<AssociateAllocation>('associate_allocations', () => client.from('associate_allocations').select('*').order('date', { ascending: false })),
        queryWorkspace<TransferAccount>('transfer_accounts', () => client.from('transfer_accounts').select('*').order('name')),
      ]);

      if (expectedFetchVersion !== undefined && expectedFetchVersion !== fetchVersionRef.current) return;
      if (requestVersion !== deferredRefreshVersionRef.current) return;

      const activityLogsData = resolveRows<ActivityLog>(activityLogsRes, 'activity_logs');
      const workspacesData = workspaces;
      setActivityLogs(normalizeActivityLogs(activityLogsData, workspacesData));
      setExpenses(resolveRows<Expense>(expensesRes, 'expenses'));
      setAdjustments(resolveRows<Adjustment>(adjustmentsRes, 'adjustments'));
      setAdjustmentRequests(resolveRows<AdjustmentRequest>(adjustmentRequestsRes, 'adjustment_requests'));
      setChannelEntries(resolveRows<ChannelEntry>(channelEntriesRes, 'channel_entries'));
      setUnitAccountEntries(resolveRows<UnitAccountEntry>(unitAccountEntriesRes, 'unit_account_entrys'));
      setOutputRequests(resolveRows<OutputRequest>(outputRequestsRes, 'output_requests'));
      setAssociates(resolveRows<Associate>(associatesRes, 'associates').map(sanitizeAssociateRecord));
      setAssociateAllocations(resolveRows<AssociateAllocation>(associateAllocationsRes, 'associate_allocations').map(normalizeAssociateAllocationRecord));
      setTransferAccounts(resolveRows<TransferAccount>(transferAccountsRes, 'transfer_accounts'));
    } catch (error) {
      console.error('Error refreshing deferred datasets:', error);
    }
  };

  const refreshOpsActivity = async (expectedFetchVersion?: number) => {
    const client = supabase;
    if (isDemoMode || !client) return;

    const requestVersion = ++opsRefreshVersionRef.current;
    try {
      const [auditEventsRes, operatorLogsRes] = await Promise.all([
        queryWorkspace<AuditEventRow>('audit_events', () =>
          client
            .from('audit_events')
            .select('id, created_at, actor_user_id, actor_label, actor_role, action, entity, unit_id, amount, details, operator_activity_id')
            .order('created_at', { ascending: false })
            .limit(1000),
        ),
        queryWorkspace<OperatorLogRow>(OPERATOR_ACTIVITY_WORKSPACE, () =>
          client
            .from(OPERATOR_ACTIVITY_WORKSPACE)
            .select('id, created_at, org_id, actor_user_id, actor_role, actor_label, started_at, last_active_at, ended_at, duration_seconds, is_active')
            .order('last_active_at', { ascending: false })
            .limit(500) as any,
        ),
      ]);

      if (expectedFetchVersion !== undefined && expectedFetchVersion !== fetchVersionRef.current) return;
      if (requestVersion !== opsRefreshVersionRef.current) return;

      const auditRows = resolveRows<AuditEventRow>(auditEventsRes, 'audit_events');
      const operatorLogRows = resolveRows<OperatorLogRow>(operatorLogsRes, OPERATOR_ACTIVITY_WORKSPACE);
      setSystemEvents(mapAuditRowsToSystemEvents(auditRows));
      setOperatorLogs(operatorLogRows.map((activity) => ({
        ...activity,
        actor_role: dbRoleToAppRole(activity.actor_role),
      })));
    } catch (error) {
      console.error('Error refreshing ops activity:', error);
    }
  };

  const runQueuedOpsRefresh = async () => {
    if (opsRefreshInFlightRef.current) {
      opsRefreshQueuedRef.current = true;
      return;
    }

    opsRefreshInFlightRef.current = true;
    try {
      await refreshOpsActivity();
    } finally {
      opsRefreshInFlightRef.current = false;
      if (opsRefreshQueuedRef.current) {
        opsRefreshQueuedRef.current = false;
        void runQueuedOpsRefresh();
      }
    }
  };

  const scheduleOpsActivityRefresh = (delayMs = 180) => {
    if (typeof window === 'undefined') {
      void runQueuedOpsRefresh();
      return;
    }

    if (opsRefreshDebounceTimerRef.current !== null) {
      window.clearTimeout(opsRefreshDebounceTimerRef.current);
    }

    opsRefreshDebounceTimerRef.current = window.setTimeout(() => {
      opsRefreshDebounceTimerRef.current = null;
      void runQueuedOpsRefresh();
    }, delayMs);
  };

  const fetchDataStaged = async () => {
    beginLoadingProgress();
    setLoading(true);
    if (isDemoMode) {
      loadDemoData();
      completeLoadingProgress();
      return;
    }

    const fetchVersion = ++fetchVersionRef.current;
    let loadingFinalized = false;
    const finalizeLoading = () => {
      if (loadingFinalized) return;
      loadingFinalized = true;
      setLoading(false);
      completeLoadingProgress();
    };

    try {
      const client = supabase;
      if (!client) {
        finalizeLoading();
        return;
      }

      const scopedOrgId = await loadProfileContext();

      // Multi-tenant safety: only platform admins can operate without an org scope.
      // Non-admin roles must remain scoped to their own tenant.
      const requiresOrgScope = role !== 'admin';
      if (requiresOrgScope && !scopedOrgId) {
        clearScopedDatasets();
        finalizeLoading();
        return;
      }

      const [unitsRes, workspacesRes, entriesRes, membersRes] = await Promise.all([
        queryWorkspace<Entity>('units', () => client.from('units').select('*').order('name')),
        queryWorkspace<Workspace>('workspaces', () => client.from('workspaces').select('*').order('date', { ascending: false })),
        queryWorkspace<Entry>('entries', () => client.from('entries').select('*')),
        queryWorkspace<Member>('members', () => client.from('members').select('*').order('name')),
      ]);

      if (fetchVersion !== fetchVersionRef.current) {
        finalizeLoading();
        return;
      }

      setUnits(resolveRows<Entity>(unitsRes, 'units'));
      setWorkspaces(normalizeWorkspacesLifecycle(resolveRows<Workspace>(workspacesRes, 'workspaces')));
      setEntries(resolveRows<Entry>(entriesRes, 'entries'));
      setMembers(resolveRows<Member>(membersRes, 'members').map(normalizeMemberArrangement));
      finalizeLoading();

      void (async () => {
        try {
          await Promise.all([
            refreshDeferredDatasets(fetchVersion),
            refreshOpsActivity(fetchVersion),
          ]);
        } catch (error) {
          console.error('Error fetching deferred data:', error);
        }
      })();
    } catch (error) {
      console.error('Error fetching staged data:', error);
      finalizeLoading();
    }
  };

  const isFetchingRef = useRef(false);

  const fetchData = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    beginLoadingProgress();
    setLoading(true);
    if (isDemoMode) {
      loadDemoData();
      completeLoadingProgress();
      return;
    }

    try {
      const client = supabase;
      if (!client) return;

      const fetchVersion = ++fetchVersionRef.current;

      const scopedOrgId = await loadProfileContext();

      // Multi-tenant safety: only platform admins can operate without an org scope.
      // Non-admin roles must remain scoped to their own tenant.
      const requiresOrgScope = role !== 'admin';
      if (requiresOrgScope && !scopedOrgId) {
        clearScopedDatasets();
        return;
      }

      if (role === 'admin') {
        void fetchAvailableOrgs();
      }

      const [
        unitsRes,
        workspacesRes,
        entriesRes,
        membersRes,
        activityLogsRes,
        expensesRes,
        adjustmentsRes,
        adjustmentRequestsRes,
        channelEntriesRes,
        unitAccountEntriesRes,
        outputRequestsRes,
        transferAccountsRes,
        associatesRes,
        associateAllocationsRes,
        systemEventsRes,
        operatorLogsRes,
      ] = await Promise.all([
        queryWorkspace<Entity>('units', () => client.from('units').select('*').order('name')),
        queryWorkspace<Workspace>('workspaces', () => client.from('workspaces').select('*').order('date', { ascending: false })),
        queryWorkspace<Entry>('entries', () => client.from('entries').select('*').order('created_at', { ascending: false })),
        queryWorkspace<Member>('members', () => client.from('members').select('*').order('name')),
        queryWorkspace<ActivityLog>('activity_logs', () => client.from('activity_logs').select('*').order('start_time', { ascending: false })),
        queryWorkspace<Expense>('expenses', () => client.from('expenses').select('*').order('date', { ascending: false })),
        queryWorkspace<Adjustment>('adjustments', () => client.from('adjustments').select('*').order('date', { ascending: false })),
        queryWorkspace<AdjustmentRequest>('adjustment_requests', () => client.from('adjustment_requests').select('*').order('requested_at', { ascending: false })),
        queryWorkspace<ChannelEntry>('channel_entries', () => client.from('channel_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<UnitAccountEntry>('unit_account_entrys', () => client.from('unit_account_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<OutputRequest>('output_requests', () => client.from('output_requests').select('*').order('requested_at', { ascending: false })),
        queryWorkspace<TransferAccount>('channel_transfer_accounts', () => client.from('channel_transfer_accounts').select('*').order('name')),
        queryWorkspace<Associate>('associates', () => client.from('associates').select('*').order('name')),
        queryWorkspace<AssociateAllocation>('associate_allocations', () => client.from('associate_allocations').select('*').order('date', { ascending: false })),
        queryWorkspace<SystemEvent>('audit_events', () => client.from('audit_events').select('*').order('created_at', { ascending: false })),
        queryWorkspace<OperatorLog>(OPERATOR_ACTIVITY_WORKSPACE, () => client.from(OPERATOR_ACTIVITY_WORKSPACE).select('*').order('started_at', { ascending: false })),
      ]);

      if (fetchVersion !== fetchVersionRef.current) return;

      const unitsData = resolveRows<Entity>(unitsRes, 'units');
      const workspacesData = normalizeWorkspacesLifecycle(resolveRows<Workspace>(workspacesRes, 'workspaces'));
      const entriesData = resolveRows<Entry>(entriesRes, 'entries');
      const membersData = resolveRows<Member>(membersRes, 'members');
      const activityLogsData = resolveRows<ActivityLog>(activityLogsRes, 'activity_logs');
      const expensesData = resolveRows<Expense>(expensesRes, 'expenses');
      const adjustmentsData = resolveRows<Adjustment>(adjustmentsRes, 'adjustments');
      const adjustmentRequestsData = resolveRows<AdjustmentRequest>(adjustmentRequestsRes, 'adjustment_requests');
      const channelEntriesData = resolveRows<ChannelEntry>(channelEntriesRes, 'channel_entries');
      const unitAccountEntriesData = resolveRows<UnitAccountEntry>(unitAccountEntriesRes, 'unit_account_entrys');
      const outputRequestsData = resolveRows<OutputRequest>(outputRequestsRes, 'output_requests');
      const associatesData = resolveRows<Associate>(associatesRes, 'associates').map(sanitizeAssociateRecord);
      const associateAllocationsData = resolveRows<AssociateAllocation>(associateAllocationsRes, 'associate_allocations').map(normalizeAssociateAllocationRecord);
      const transferAccountsData = resolveRows<TransferAccount>(transferAccountsRes, 'channel_transfer_accounts');
      const systemEventsData = mapAuditRowsToSystemEvents(resolveRows<any>(systemEventsRes, 'audit_events'));
      const operatorLogsRows = resolveRows<OperatorLog>(operatorLogsRes, OPERATOR_ACTIVITY_WORKSPACE);
      const operatorLogsData = operatorLogsRows.map((activity) => ({
        ...activity,
        actor_role: dbRoleToAppRole(activity.actor_role),
      }));

      setUnits(unitsData);
      setWorkspaces(workspacesData);
      setEntries(entriesData);
      setMembers(membersData.map(normalizeMemberArrangement));
      setActivityLogs(normalizeActivityLogs(activityLogsData, workspacesData));
      setExpenses(expensesData);
      setAdjustments(adjustmentsData);
      setAdjustmentRequests(adjustmentRequestsData);
      setChannelEntries(channelEntriesData);
      setUnitAccountEntries(unitAccountEntriesData);
      setOutputRequests(outputRequestsData);
      setAssociates(associatesData);
      setAssociateAllocations(associateAllocationsData);
      setTransferAccounts(transferAccountsData);
      setSystemEvents(systemEventsData);
      setOperatorLogs(operatorLogsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      completeLoadingProgress();
    }
  };

  useEffect(() => {
    if (authLoading || roleLoading) return;

    if (!isDemoMode && !user) {
      clearScopedDatasets();
      setManagedOrgIds([]);
      setActiveOrgId(null);
      setLoading(false);
      localStorage.removeItem('flow_ops_last_org_id');
      localStorage.removeItem('flow_ops_last_meta_org_id');
      setAuthorityResolved(true); // Ensure authorityResolved is set even if no user
      return;
    }

    void fetchDataStaged();
  }, [authLoading, isDemoMode, role, roleLoading, user?.id]);

  useEffect(() => {
    if (isSupabaseConfigured && !!user && !activeOrgId && !loading && !authorityResolved) {
      void loadProfileContext();
    }
  }, [user, activeOrgId, loading, authorityResolved]);

  useEffect(() => {
    if (isDemoMode || !supabase || !user || !activeOrgId || operatorLogsUnavailableRef.current) return;
    if (typeof window === 'undefined') return;

    const currentUserId = user.id;
    const storedUserId = readOperatorSessionValue(OPERATOR_LOG_USER_ID_KEY);
    const nowIso = new Date().toISOString();

    if (storedUserId !== currentUserId) {
      writeOperatorSessionValue(OPERATOR_LOG_ID_KEY, uuidv4());
      writeOperatorSessionValue(OPERATOR_LOG_STARTED_AT_KEY, nowIso);
      writeOperatorSessionValue(OPERATOR_LOG_USER_ID_KEY, currentUserId);
    } else {
      if (!readOperatorSessionValue(OPERATOR_LOG_ID_KEY)) {
        writeOperatorSessionValue(OPERATOR_LOG_ID_KEY, uuidv4());
      }
      if (!readOperatorSessionValue(OPERATOR_LOG_STARTED_AT_KEY)) {
        writeOperatorSessionValue(OPERATOR_LOG_STARTED_AT_KEY, nowIso);
      }
    }

    const operatorLogId = readOperatorSessionValue(OPERATOR_LOG_ID_KEY) ?? uuidv4();
    const startedAt = readOperatorSessionValue(OPERATOR_LOG_STARTED_AT_KEY) ?? nowIso;
    writeOperatorSessionValue(OPERATOR_LOG_ID_KEY, operatorLogId);
    writeOperatorSessionValue(OPERATOR_LOG_STARTED_AT_KEY, startedAt);
    currentOperatorLogIdRef.current = operatorLogId;
    currentOperatorLogStartedAtRef.current = startedAt;

    const username = resolveOperatorUsername();

    const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

    const toMessage = (error: unknown) => {
      if (error instanceof Error && error.message) return error.message;
      return String(error);
    };

    let consecutiveNetworkHeartbeatFailures = 0;
    let suppressHeartbeatUntil = 0;

    const upsertActivity = async () => {
      if (isOffline()) {
        warnOnce('operator-log-offline', 'Operator activity heartbeat paused while offline. Sync resumes when connection is restored.');
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      if (Date.now() < suppressHeartbeatUntil) {
        return;
      }

      const startedAtDate = new Date(startedAt);
      const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAtDate.getTime()) / 1000));

      try {
        const client = supabase;
        if (!client) return;
        const { error } = await client.from(OPERATOR_ACTIVITY_WORKSPACE).upsert([
          {
            id: operatorLogId,
            org_id: activeOrgId,
            actor_user_id: currentUserId,
            actor_role: appRoleToDbRole(role),
            actor_label: username,
            started_at: startedAt,
            last_active_at: new Date().toISOString(),
            ended_at: null,
            duration_seconds: durationSeconds,
            is_active: true,
          },
        ]);

        if (error) {
          if (isMissingWorkspaceError(error, OPERATOR_ACTIVITY_WORKSPACE)) {
            markMissingWorkspace(OPERATOR_ACTIVITY_WORKSPACE);
            warnOnce('missing-operator-activities-upsert', 'Supabase workspace operator_activities is missing. Operator presence tracking is disabled until migration is applied.', error.message);
            return;
          }

          const normalizedMessage = (error.message ?? '').toLowerCase();
          if (normalizedMessage.includes('failed to fetch') || normalizedMessage.includes('network') || normalizedMessage.includes('connection')) {
            consecutiveNetworkHeartbeatFailures += 1;
            suppressHeartbeatUntil = Date.now() + Math.min(300000, 5000 * (2 ** Math.min(consecutiveNetworkHeartbeatFailures, 5)));
          } else {
            consecutiveNetworkHeartbeatFailures = 0;
            suppressHeartbeatUntil = 0;
          }

          warnOnce(`operator-activity-upsert-${error.code ?? 'unknown'}`, 'Operator activity heartbeat failed.', error.message);
          return;
        }

        consecutiveNetworkHeartbeatFailures = 0;
        suppressHeartbeatUntil = 0;
      } catch (error) {
        consecutiveNetworkHeartbeatFailures += 1;
        suppressHeartbeatUntil = Date.now() + Math.min(300000, 5000 * (2 ** Math.min(consecutiveNetworkHeartbeatFailures, 5)));
        warnOnce('operator-log-upsert-fetch', 'Operator activity heartbeat failed due to network interruption.', toMessage(error));
      }
    };

    const markActivityEnded = async () => {
      if (isOffline()) return;

      const started = currentOperatorLogStartedAtRef.current ? new Date(currentOperatorLogStartedAtRef.current) : new Date();
      const durationSeconds = Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000));

      try {
        const client = supabase;
        if (!client) return;
        const { error } = await client
          .from(OPERATOR_ACTIVITY_WORKSPACE)
          .update({
            last_active_at: new Date().toISOString(),
            ended_at: new Date().toISOString(),
            duration_seconds: durationSeconds,
            is_active: false,
          })
          .eq('id', operatorLogId)
          .eq('actor_user_id', currentUserId);

        if (error) {
          if (isMissingWorkspaceError(error, OPERATOR_ACTIVITY_WORKSPACE)) {
            markMissingWorkspace(OPERATOR_ACTIVITY_WORKSPACE);
            return;
          }
          warnOnce(`operator-activity-end-${error.code ?? 'unknown'}`, 'Unable to mark operator activity as ended.', error.message);
        }
      } catch (error) {
        warnOnce('operator-activity-end-fetch', 'Unable to mark operator activity as ended due to network interruption.', toMessage(error));
      }
    };

    void upsertActivity();
    const startedEventKey = `flow_ops_operator_log_started_${operatorLogId}`;
    if (!localStorage.getItem(startedEventKey)) {
      localStorage.setItem(startedEventKey, '1');
      void recordSystemEvent({ action: 'operator_log_started', entity: 'log', unit_id: operatorLogId, details: `${username} signed in` });
    }

    const heartbeatTimer = window.setInterval(() => {
      void upsertActivity();
    }, 30000);

    const handlePageHide = () => {
      void markActivityEnded();
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.clearInterval(heartbeatTimer);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      void markActivityEnded();
    };
  }, [activeOrgId, isDemoMode, role, user?.id]);

  useEffect(() => {
    if (isDemoMode || !supabase || !user || !activeOrgId) return;
    if (auditEventsUnavailableRef.current && operatorLogsUnavailableRef.current) return;

    const channel = supabase
      .channel(`ops-activity-${activeOrgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: OPERATOR_ACTIVITY_WORKSPACE, filter: `org_id=eq.${activeOrgId}` },
        () => {
          if (!operatorLogsUnavailableRef.current) {
            scheduleOpsActivityRefresh();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_events', filter: `org_id=eq.${activeOrgId}` },
        () => {
          if (!auditEventsUnavailableRef.current) {
            scheduleOpsActivityRefresh();
          }
        },
      )
      .subscribe();

    const fallbackPoll = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      void Promise.all([
        refreshDeferredDatasets(),
        refreshOpsActivity(),
      ]);
    }, 45000);

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void Promise.all([
        refreshDeferredDatasets(),
        refreshOpsActivity(),
      ]);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(fallbackPoll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      const client = supabase;
      if (client) void client.removeChannel(channel);
    };
  }, [activeOrgId, isDemoMode, user?.id]);

  // --- Actions ---

  const addUnit = async (unitData: Omit<Entity, 'id' | 'created_at'>): Promise<string> => {
    const sanitizedUnit = sanitizeUnitInput(unitData);
    if (isDemoMode) {
      const newUnit = { ...sanitizedUnit, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [...units, newUnit];
      setUnits(updated);
      localStorage.setItem('flow_ops_units', JSON.stringify(updated));
      void recordSystemEvent({ action: 'entity_added', entity: 'unit', unit_id: newUnit.id, details: newUnit.name });
      return newUnit.id;
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) throw new Error('Supabase not initialized');
      const insertPayload = {
        ...sanitizedUnit,
        org_id: scopedOrgId,
        ...(unitPartnerColumnUnavailableRef.current ? {} : { attributed_associate_id: sanitizedUnit.attributed_associate_id })
      };

      const insertResult = await supabase.from('units').insert([insertPayload]).select('id').single();
      if (insertResult.error) {
        const error = insertResult.error;
        if (isMissingColumnError(error, 'units', 'attributed_associate_id')) {
          unitPartnerColumnUnavailableRef.current = true;
          warnOnce(
            'missing-units-attributed-associate-id',
            'Supabase units.attributed_associate_id column is missing. Entity writes will continue without associate attribution until migration is applied.',
            error.message ?? undefined,
          );
          const fallbackPayload = stripUnitAssociateColumn(sanitizedUnit);
          const fallbackResult = await supabase.from('units').insert([{ ...fallbackPayload, org_id: scopedOrgId }]).select('id').single();
          if (fallbackResult.error) throw fallbackResult.error;
          if (!fallbackResult.data?.id) throw new Error('Entity was created but no id was returned.');
          await fetchData();
          void recordSystemEvent({ action: 'entity_added', entity: 'unit', unit_id: fallbackResult.data.id, details: sanitizedUnit.name });
          return fallbackResult.data.id;
        } else {
          throw error;
        }
      }
      if (!insertResult.data?.id) throw new Error('Entity was created but no id was returned.');
      await fetchData();
      void recordSystemEvent({ action: 'entity_added', entity: 'unit', unit_id: insertResult.data.id, details: sanitizedUnit.name });
      return insertResult.data.id;
    }
  };

  const importUnits = async (newEntitiesData: Omit<Entity, 'id' | 'created_at'>[]) => {
    const sanitizedEntities = newEntitiesData.map(sanitizeUnitInput);
    if (isDemoMode) {
      const newEntities = sanitizedEntities.map(p => ({
        ...p,
        id: uuidv4(),
        created_at: new Date().toISOString()
      }));
      const updated = [...units, ...newEntities];
      setUnits(updated);
      localStorage.setItem('flow_ops_units', JSON.stringify(updated));
      void recordSystemEvent({ action: 'units_imported', entity: 'unit', amount: newEntities.length, details: `${newEntities.length} units imported` });
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) return;
      const insertPayload = sanitizedEntities.map(entity => ({
        ...entity,
        org_id: scopedOrgId,
        ...(unitPartnerColumnUnavailableRef.current ? {} : { attributed_associate_id: entity.attributed_associate_id })
      }));

      const { error } = await supabase.from('units').insert(insertPayload);
      if (error) {
        if (isMissingColumnError(error, 'units', 'attributed_associate_id')) {
          unitPartnerColumnUnavailableRef.current = true;
          warnOnce(
            'missing-units-attributed-associate-id',
            'Supabase units.attributed_associate_id column is missing. Entity writes will continue without associate attribution until migration is applied.',
            error.message ?? undefined,
          );
          const fallbackPayload = sanitizedEntities.map(item => ({ ...stripUnitAssociateColumn(item), org_id: scopedOrgId }));
          const fallbackResult = await supabase.from('units').insert(fallbackPayload);
          if (fallbackResult.error) throw fallbackResult.error;
        } else {
          throw error;
        }
      }
      await fetchData();
      void recordSystemEvent({ action: 'units_imported', entity: 'unit', amount: sanitizedEntities.length, details: `${sanitizedEntities.length} units imported` });
    }
  };

  const updateUnit = async (entity: Entity) => {
    const sanitizedUnit = sanitizeUnitInput(entity);
    if (isDemoMode) {
      const updated = units.map(p => p.id === entity.id ? { ...entity, ...sanitizedUnit } : p);
      setUnits(updated);
      localStorage.setItem('flow_ops_units', JSON.stringify(updated));
      void recordSystemEvent({ action: 'entity_updated', entity: 'unit', unit_id: entity.id, details: entity.name });
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) return;
      const updatePayload = {
        ...sanitizedUnit,
        org_id: scopedOrgId,
        ...(unitPartnerColumnUnavailableRef.current ? {} : { attributed_associate_id: sanitizedUnit.attributed_associate_id })
      };

      const { error } = await supabase.from('units').update(updatePayload).eq('id', entity.id).eq('org_id', scopedOrgId);
      if (error) {
        if (isMissingColumnError(error, 'units', 'attributed_associate_id')) {
          unitPartnerColumnUnavailableRef.current = true;
          warnOnce(
            'missing-units-attributed-associate-id',
            'Supabase units.attributed_associate_id column is missing. Entity writes will continue without associate attribution until migration is applied.',
            error.message ?? undefined,
          );
          const fallbackPayload = stripUnitAssociateColumn({ ...entity, ...sanitizedUnit });
          const fallbackResult = await supabase.from('units').update({ ...fallbackPayload, org_id: scopedOrgId }).eq('id', entity.id).eq('org_id', scopedOrgId);
          if (fallbackResult.error) throw fallbackResult.error;
        } else {
          throw error;
        }
      }
      await fetchData();
      void recordSystemEvent({ action: 'entity_updated', entity: 'unit', unit_id: entity.id, details: entity.name });
    }
  };

  const deleteUnit = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can delete entity profiles.');

    const existingEntity = units.find(entity => entity.id === id);
    if (!existingEntity) return;

    const hasActiveActivityEntry = entries.some(entry => entry.unit_id === id && !entry.left_at);
    if (hasActiveActivityEntry) {
      throw new Error('Cannot delete entity with an active activity. Output and remove from workspace first.');
    }

    const hasEntriesHistory = entries.some(entry => entry.unit_id === id);
    if (hasEntriesHistory) {
      throw new Error('Cannot delete entity with activity history. Remove related entries entries first.');
    }

    const hasAdjustmentHistory = adjustments.some(adjustment => adjustment.unit_id === id);
    if (hasAdjustmentHistory) {
      throw new Error('Cannot delete entity with adjustment history. Resolve or remove related adjustment records first.');
    }

    if (isDemoMode) {
      const updatedEntities = units.filter(entity => entity.id !== id);
      setUnits(updatedEntities);
      localStorage.setItem('flow_ops_units', JSON.stringify(updatedEntities));
      void recordSystemEvent({ action: 'entity_deleted', entity: 'unit', unit_id: id, details: existingEntity.name ?? 'Entity deleted' });
      return;
    }

    if (!supabase) throw new Error('Supabase project connectivity is not configured in environment variables.');
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('units').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    void recordSystemEvent({ action: 'entity_deleted', entity: 'unit', unit_id: id, details: existingEntity.name ?? 'Entity deleted' });
    await fetchData();
  };

  const transferUnitTotal = async (fromUnitId: string, toUnitId: string, amount: number) => {
    requirePermission(canAlign, 'Only admin can transfer entity totals.');
    if (fromUnitId === toUnitId) throw new Error('Select two different units for transfer.');
    requirePositiveAmount(amount, 'Transfer amount');

    const fromEntity = units.find(entity => entity.id === fromUnitId);
    const toEntity = units.find(entity => entity.id === toUnitId);
    if (!fromEntity || !toEntity) throw new Error('One or both selected units were not found.');

    const fromTotal = fromEntity.total ?? 0;
    const toTotal = toEntity.total ?? 0;
    if (fromTotal < amount) {
      throw new Error('Insufficient total for transfer.');
    }

    const updatedFrom: Entity = { ...fromEntity, total: fromTotal - amount };
    const updatedTo: Entity = { ...toEntity, total: toTotal + amount };

    if (!isDemoMode && supabase) {
      const scopedOrgId = requireOrgScope();
      const rpcAttempt = await supabase.rpc('entity_total_transfer', {
        p_from_unit_id: fromUnitId,
        p_to_unit_id: toUnitId,
        p_amount: amount,
        p_note: null,
        p_org_id: scopedOrgId,
      });

      if (!rpcAttempt.error) {
        await fetchData();
        void recordSystemEvent({
          action: 'entity_total_transfer',
          entity: 'entries',
          amount,
          details: `${fromEntity.name || fromEntity.id} → ${toEntity.name || toEntity.id}`,
        });
        return;
      }

      if (!isMissingFunctionError(rpcAttempt.error, 'entity_total_transfer')) {
        throw rpcAttempt.error;
      }
    }

    if (isDemoMode) {
      const updated = units.map(entity => {
        if (entity.id === updatedFrom.id) return updatedFrom;
        if (entity.id === updatedTo.id) return updatedTo;
        return entity;
      });
      setUnits(updated);
      localStorage.setItem('flow_ops_units', JSON.stringify(updated));
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();

      const updateUnitRecord = async (entityRecord: Entity) => {
        const client = supabase;
        if (!client) return;
        const updatePayload = unitPartnerColumnUnavailableRef.current
          ? stripUnitAssociateColumn(entityRecord)
          : entityRecord;
        const { error } = await client.from('units').update({ ...updatePayload, org_id: scopedOrgId }).eq('id', entityRecord.id).eq('org_id', scopedOrgId);
        if (error) {
          if (isMissingColumnError(error, 'units', 'attributed_associate_id')) {
            unitPartnerColumnUnavailableRef.current = true;
            warnOnce(
              'missing-units-attributed-associate-id',
              'Supabase units.attributed_associate_id column is missing. Entity writes will continue without associate attribution until migration is applied.',
              error.message ?? undefined,
            );
            const fallbackPayload = stripUnitAssociateColumn(entityRecord);
            const fallbackResult = await client.from('units').update({ ...fallbackPayload, org_id: scopedOrgId }).eq('id', entityRecord.id).eq('org_id', scopedOrgId);
            if (fallbackResult.error) throw fallbackResult.error;
            return;
          }
          throw error;
        }
      };

      await updateUnitRecord(updatedFrom);

      try {
        await updateUnitRecord(updatedTo);
      } catch (error) {
        await updateUnitRecord(fromEntity);
        throw error;
      }

      await fetchData();
    }

    void recordSystemEvent({
      action: 'entity_total_transfer',
      entity: 'entries',
      amount,
      details: `${fromEntity.name || fromEntity.id} → ${toEntity.name || toEntity.id}`,
    });
  };

  const transferChannelValues = async (fromMethod: string, toMethod: string, amount: number, date: string) => {
    requirePermission(canManageValue, 'Only admin or operator can transfer value between accounts.');
    const sourceMethod = requireNonEmpty(fromMethod, 'Source method');
    const destinationMethod = requireNonEmpty(toMethod, 'Destination method');
    if (sourceMethod === destinationMethod) throw new Error('Source and destination method must be different.');
    const normalizedAmount = requirePositiveAmount(amount, 'Transfer amount');
    const normalizedDate = requireValidDate(date, 'Transfer date');
    const transferId = uuidv4();

    const sourceTotal = channelEntries.reduce((sum, entry) => {
      if (entry.method !== sourceMethod) return sum;
      return sum + (entry.type === 'increment' ? entry.amount : -entry.amount);
    }, 0);
    if (sourceTotal < normalizedAmount) throw new Error('Insufficient source total for transfer.');

    if (isDemoMode) {
      const timestamp = new Date().toISOString();
      const decrement: ChannelEntry = {
        id: uuidv4(),
        amount: normalizedAmount,
        type: 'decrement',
        method: sourceMethod,
        date: normalizedDate,
        operation_type: 'transfer',
        transfer_id: transferId,
        counterparty_method: destinationMethod,
        created_at: timestamp,
      };
      const increment: ChannelEntry = {
        id: uuidv4(),
        amount: normalizedAmount,
        type: 'increment',
        method: destinationMethod,
        date: normalizedDate,
        operation_type: 'transfer',
        transfer_id: transferId,
        counterparty_method: sourceMethod,
        created_at: timestamp,
      };

      const updated = [increment, decrement, ...channelEntries];
      setChannelEntries(updated);
      localStorage.setItem('flow_ops_channel_base', JSON.stringify(updated));
      void recordSystemEvent({
        action: 'channel_transfer',
        entity: 'channel',
        unit_id: transferId,
        amount: normalizedAmount,
        details: `${sourceMethod} → ${destinationMethod}`,
      });
      return transferId;
    }

    if (!supabase) throw new Error('Supabase not initialized.');
    const scopedOrgId = requireOrgScope();

    const rpcResult = await supabase.rpc('channel_base_transfer', {
      p_from_method: sourceMethod,
      p_to_method: destinationMethod,
      p_amount: normalizedAmount,
      p_date: normalizedDate,
      p_note: null,
      p_transfer_id: transferId,
      p_org_id: scopedOrgId,
    });

    if (!rpcResult.error) {
      await fetchData();
      void recordSystemEvent({
        action: 'channel_transfer',
        entity: 'channel',
        unit_id: transferId,
        amount: normalizedAmount,
        details: `${sourceMethod} → ${destinationMethod}`,
      });
      return transferId;
    }

    if (!isMissingFunctionError(rpcResult.error, 'channel_base_transfer')) {
      throw rpcResult.error;
    }

    const decrementData = sanitizeChannelEntryInput({
      amount: normalizedAmount,
      type: 'decrement',
      method: sourceMethod,
      date: normalizedDate,
      operation_type: 'transfer',
      transfer_id: transferId,
      counterparty_method: destinationMethod,
    });
    const incrementData = sanitizeChannelEntryInput({
      amount: normalizedAmount,
      type: 'increment',
      method: destinationMethod,
      date: normalizedDate,
      operation_type: 'transfer',
      transfer_id: transferId,
      counterparty_method: sourceMethod,
    });

    const decrementInsert = await supabase.from('channel_entries').insert([{ ...decrementData, org_id: scopedOrgId }]).select('id').single();
    if (decrementInsert.error) throw decrementInsert.error;

    const incrementInsert = await supabase.from('channel_entries').insert([{ ...incrementData, org_id: scopedOrgId }]);
    if (incrementInsert.error) {
      const rollbackData = sanitizeChannelEntryInput({
        amount: normalizedAmount,
        type: 'decrement',
        method: sourceMethod,
        date: normalizedDate,
        operation_type: 'transfer' as const,
        transfer_id: transferId,
        counterparty_method: destinationMethod,
      });
      await supabase.from('channel_entries').insert([{ ...rollbackData, org_id: scopedOrgId }]);
      throw incrementInsert.error;
    }

    await fetchData();
    void recordSystemEvent({
      action: 'channel_transfer',
      entity: 'channel',
      unit_id: transferId,
      amount: normalizedAmount,
      details: `${sourceMethod} → ${destinationMethod}`,
    });
    return transferId;
  };

  const addWorkspace = async (workspaceData: NewWorkspaceInput): Promise<string> => {
    requirePermission(canOperateLog, 'Only admin or operator can create activities.');
    if (!workspaceData.date) throw new Error('Workspace date is required.');
    requireValidDate(workspaceData.date, 'Workspace date');
    const scopedOrgId = workspaceData.org_id ?? requireOrgScope();
    const normalizedWorkspaceData: Omit<Workspace, 'id' | 'created_at'> = {
      ...workspaceData,
      org_id: scopedOrgId,
      status: normalizeWorkspaceStatus(workspaceData.status),
      org_code: requireValidOrgCode(workspaceData.org_code),
    };
    if (isDemoMode) {
      const newWorkspace = normalizeWorkspaceLifecycle({ ...normalizedWorkspaceData, id: uuidv4(), created_at: new Date().toISOString() });
      const updated = [newWorkspace, ...workspaces];
      setWorkspaces(updated);
      localStorage.setItem('flow_ops_workspaces', JSON.stringify(updated));
      void recordSystemEvent({ action: 'activity_created', entity: 'workspace', unit_id: newWorkspace.id, details: `Status: ${newWorkspace.status}` });
      return newWorkspace.id;
    } else {
      if (!supabase) throw new Error("Supabase not initialized");
      const insertResult = await supabase.from('workspaces').insert([{ ...normalizedWorkspaceData, org_id: scopedOrgId }]).select();
      if (insertResult.error) throw insertResult.error;
      const { data } = insertResult;
      if (!data || data.length === 0) throw new Error('Workspace creation succeeded but no workspace id was returned.');
      void recordSystemEvent({ action: 'activity_created', entity: 'workspace', unit_id: data[0].id, details: `Status: ${normalizedWorkspaceData.status}` });
      await fetchData();
      return data[0].id;
    }
  };

  const updateWorkspace = async (workspace: Workspace) => {
    const normalizedWorkspace = normalizeWorkspaceLifecycle(workspace);
    const existingWorkspace = workspaces.find(item => item.id === normalizedWorkspace.id);
    if (existingWorkspace) {
      if (existingWorkspace.status === 'archived' && normalizedWorkspace.status === 'archived') {
        throw new Error('Archived activities are locked.');
      }

      if (!isAllowedWorkspaceStatusTransition(existingWorkspace.status, normalizedWorkspace.status)) {
        throw new Error(`Invalid status transition from ${existingWorkspace.status} to ${normalizedWorkspace.status}.`);
      }

      if (existingWorkspace.status !== normalizedWorkspace.status) {
        if (normalizedWorkspace.status === 'completed') {
          requirePermission(canAlign, 'Only admin/operator can total activities.');
          if (!isTotaldWorkspace(normalizedWorkspace.id)) throw new Error('Activity must be totald before completion.');
        } else {
          requirePermission(canOperateLog, 'Only admin or operator can update activity lifecycle.');
        }
      } else {
        requirePermission(canManageValue, 'Only admin/operator can update workspace operations.');
      }
    }

    if (isDemoMode) {
      const updated = workspaces.map(g => g.id === normalizedWorkspace.id ? normalizedWorkspace : g);
      setWorkspaces(updated);
      localStorage.setItem('flow_ops_workspaces', JSON.stringify(updated));
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) return;
      const updateResult = await supabase.from('workspaces').update(normalizedWorkspace).eq('id', normalizedWorkspace.id).eq('org_id', scopedOrgId);
      if (updateResult.error) throw updateResult.error;
      await fetchData();
    }

    if (existingWorkspace && existingWorkspace.status !== normalizedWorkspace.status) {
      void recordSystemEvent({ action: 'activity_status_changed', entity: 'workspace', unit_id: normalizedWorkspace.id, details: `${existingWorkspace.status} → ${normalizedWorkspace.status}` });
    }
  };

  const deleteWorkspace = async (id: string) => {
    requirePermission(canOperateLog, 'Only admin or operator can delete activities.');
    const existingWorkspace = workspaces.find(item => item.id === id);
    if (existingWorkspace?.status === 'completed') {
      throw new Error('Completed activities are locked and cannot be deleted.');
    }
    if (existingWorkspace?.status === 'archived') {
      throw new Error('Archived activities are locked and cannot be deleted.');
    }

    if (isDemoMode) {
      const updatedWorkspaces = workspaces.filter(workspace => workspace.id !== id);
      const updatedEntries = entries.filter(entry => entry.workspace_id !== id);
      const updatedActivityLogs = activityLogs.map(log => log.workspace_id === id ? { ...log, workspace_id: undefined } : log);
      const updatedExpensesList = expenses.map(expense => expense.workspace_id === id ? { ...expense, workspace_id: undefined } : expense);

      setWorkspaces(updatedWorkspaces);
      setEntries(updatedEntries);
      setActivityLogs(updatedActivityLogs);
      setExpenses(updatedExpensesList);

      localStorage.setItem('flow_ops_workspaces', JSON.stringify(updatedWorkspaces));
      localStorage.setItem('flow_ops_entries', JSON.stringify(updatedEntries));
      localStorage.setItem('flow_ops_activity_logs', JSON.stringify(updatedActivityLogs));
      localStorage.setItem('flow_ops_decrements', JSON.stringify(updatedExpensesList));
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) return;
      const { error } = await supabase.from('workspaces').delete().eq('id', id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
    }

    void recordSystemEvent({ action: 'activity_deleted', entity: 'workspace', unit_id: id, details: existingWorkspace ? `Deleted ${existingWorkspace.status} activity` : 'Activity deleted' });
  };

  const addEntry = async (entryData: Omit<Entry, 'id' | 'created_at' | 'net'>) => {
    requirePermission(canOperateLog, 'Only admin or operator can add units to an activity.');
    requireEntriesMutationAllowed(entryData.workspace_id, 'add');
    requireMinimumAmount(entryData.input_amount, 'Input amount', 10);
    requireNonNegativeAmount(entryData.output_amount, 'Output amount');
    const net = entryData.output_amount - entryData.input_amount;
    const fullEntry = {
      ...entryData,
      net,
      joined_at: new Date().toISOString() // Default join time is now
    };

    if (isDemoMode) {
      const newEntry = { ...fullEntry, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [...entries, newEntry];
      setEntries(updated);
      localStorage.setItem('flow_ops_entries', JSON.stringify(updated));
      void recordSystemEvent({ action: 'entries_entry_added', entity: 'entries', unit_id: newEntry.id, amount: newEntry.input_amount, details: 'Entity input recorded' });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { net: _net, ...fullEntryForDb } = fullEntry;
      let insertPayload = stripUnavailableEntriesColumns({ ...fullEntryForDb, org_id: scopedOrgId } as Record<string, unknown>);
      let insertResult = await supabase.from('entries').insert([insertPayload]);

      for (let attempt = 0; insertResult.error && attempt < 4; attempt += 1) {
        const missingColumn = extractMissingColumnName(insertResult.error, 'entries');
        if (!missingColumn) break;
        markEntriesColumnUnavailable(missingColumn);
        insertPayload = stripUnavailableEntriesColumns({ ...fullEntryForDb, org_id: scopedOrgId } as Record<string, unknown>);
        insertResult = await supabase.from('entries').insert([insertPayload]);
      }

      if (insertResult.error) {
        throw insertResult.error;
      }
      void recordSystemEvent({ action: 'entries_entry_added', entity: 'entries', amount: fullEntry.input_amount, details: 'Entity input recorded' });
      await fetchData();
    }
  };

  const updateEntry = async (entry: Entry) => {
    requirePermission(canManageValue, 'Only admin/operator can edit entries.');
    requireEntriesMutationAllowed(entry.workspace_id, 'update');
    requireMinimumAmount(entry.input_amount, 'Input amount', 10);
    requireNonNegativeAmount(entry.output_amount, 'Output amount');
    const net = entry.output_amount - entry.input_amount;
    // Ensure we keep all fields including joined_at and left_at
    const fullEntry = {
      ...entry,
      net
    };
    const normalizedPersistedEntry = {
      ...fullEntry,
      position_id: fullEntry.position_id ?? null,
      left_at: fullEntry.left_at ?? null,
      activity_units: fullEntry.activity_units ?? null,
      sort_order: fullEntry.sort_order ?? null,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { net: _entryNet, ...normalizedPersistedEntryForDb } = normalizedPersistedEntry;

    if (isDemoMode) {
      const updated = entries.map(l => l.id === entry.id ? fullEntry : l);
      setEntries(updated);
      localStorage.setItem('flow_ops_entries', JSON.stringify(updated));
      void recordSystemEvent({ action: 'entries_entry_updated', entity: 'entries', unit_id: entry.id, amount: net, details: 'Entries output/update applied' });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const previousEntries = entries;
      const optimisticEntries = previousEntries.map(item => (item.id === entry.id ? fullEntry : item));
      setEntries(optimisticEntries);

      try {
        let updatePayload = stripUnavailableEntriesColumns({ ...normalizedPersistedEntryForDb, org_id: scopedOrgId } as Record<string, unknown>);
        let updateResult = await supabase.from('entries').update(updatePayload).eq('id', entry.id).eq('org_id', scopedOrgId);

        for (let attempt = 0; updateResult.error && attempt < 4; attempt += 1) {
          const missingColumn = extractMissingColumnName(updateResult.error, 'entries');
          if (!missingColumn) break;
          markEntriesColumnUnavailable(missingColumn);
          updatePayload = stripUnavailableEntriesColumns({ ...normalizedPersistedEntryForDb, org_id: scopedOrgId } as Record<string, unknown>);
          updateResult = await supabase.from('entries').update(updatePayload).eq('id', entry.id).eq('org_id', scopedOrgId);
        }

        if (updateResult.error) {
          throw updateResult.error;
        }
      } catch (error) {
        setEntries(previousEntries);
        throw error;
      }

      void recordSystemEvent({ action: 'entries_entry_updated', entity: 'entries', unit_id: entry.id, amount: net, details: 'Entries output/update applied' });
      try {
        await fetchData();
      } catch {
        setEntries(previousEntries);
        throw new Error('Unable to refresh entries after update. Please retry.');
      }
    }
  };

  const deleteEntry = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can delete entries.');
    const existingEntry = entries.find(item => item.id === id);
    if (existingEntry) requireEntriesMutationAllowed(existingEntry.workspace_id, 'delete');
    if (isDemoMode) {
      const updated = entries.filter(l => l.id !== id);
      setEntries(updated);
      localStorage.setItem('flow_ops_entries', JSON.stringify(updated));
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('entries').delete().eq('id', id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
    }

    void recordSystemEvent({ action: 'entries_entry_deleted', entity: 'entries', unit_id: id, details: 'Entries entry removed' });
  };

  // --- Member & Operations Actions ---

  const addMember = async (memberData: Omit<Member, 'id' | 'created_at'>) => {
    const normalizedMember = sanitizeMemberInput(memberData);
    if (isDemoMode) {
      const newMember = { ...normalizedMember, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [...members, newMember];
      setMembers(updated);
      localStorage.setItem('flow_ops_members', JSON.stringify(updated));
      void recordSystemEvent({ action: 'member_added', entity: 'member', unit_id: newMember.id, details: newMember.name ?? 'Team member added' });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();
      const scopedMemberPayload = { ...normalizedMember, org_id: orgId };
      const { error } = await supabase.from('members').insert([scopedMemberPayload]);
      if (error) throw normalizeSupabaseWriteError(error);
      await fetchData();
      void recordSystemEvent({ action: 'member_added', entity: 'member', details: normalizedMember.name ?? 'Team member added' });
    }
  };

  const importMembers = async (newMembersData: Omit<Member, 'id' | 'created_at'>[]) => {
    const normalizedBatch = newMembersData.map((item) => sanitizeMemberInput(item));
    if (isDemoMode) {
      const newMembers = normalizedBatch.map((member) => ({
        ...member,
        id: uuidv4(),
        created_at: new Date().toISOString()
      }));
      const updated = [...members, ...newMembers];
      setMembers(updated);
      localStorage.setItem('flow_ops_members', JSON.stringify(updated));
      void recordSystemEvent({ action: 'member_imported', entity: 'member', amount: newMembers.length, details: `${newMembers.length} team members imported` });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();
      const scopedBatch = normalizedBatch.map((item) => ({ ...item, org_id: orgId }));
      const { error } = await supabase.from('members').insert(scopedBatch);
      if (error) throw normalizeSupabaseWriteError(error);
      await fetchData();
      void recordSystemEvent({ action: 'member_imported', entity: 'member', amount: normalizedBatch.length, details: `${normalizedBatch.length} team members imported` });
    }
  };

  const updateMember = async (memberData: Member) => {
    const normalizedMember = sanitizeMemberRecord(memberData);
    if (isDemoMode) {
      const updated = members.map((member) => member.id === normalizedMember.id ? normalizedMember : member);
      setMembers(updated);
      localStorage.setItem('flow_ops_members', JSON.stringify(updated));
      void recordSystemEvent({ action: 'member_updated', entity: 'member', unit_id: normalizedMember.id, details: normalizedMember.name ?? 'Team member updated' });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('members').update(normalizedMember).eq('id', normalizedMember.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
      void recordSystemEvent({ action: 'member_updated', entity: 'member', unit_id: normalizedMember.id, details: normalizedMember.name ?? 'Team member updated' });
    }
  };

  const deleteMember = async (id: string) => {
    requirePermission(canOperateLog, 'Only admin or operator can delete member profiles.');

    const existingMember = members.find((member) => member.id === id);
    if (!existingMember) return;

    const hasActiveActivityLog = activityLogs.some(log => log.member_id === id && log.status === 'active');
    if (hasActiveActivityLog) {
      throw new Error('Cannot delete member profile with an active activity. Close it first.');
    }

    if (isDemoMode) {
      const updatedMembers = members.filter((member) => member.id !== id);
      const updatedActivityLogs = activityLogs.filter((log) => log.member_id !== id);
      setMembers(updatedMembers);
      setActivityLogs(updatedActivityLogs);
      localStorage.setItem('flow_ops_members', JSON.stringify(updatedMembers));
      localStorage.setItem('flow_ops_activity_logs', JSON.stringify(updatedActivityLogs));
      void recordSystemEvent({ action: 'member_deleted', entity: 'member', unit_id: id, details: existingMember.name ?? 'Member deleted' });
      return;
    }

    if (!supabase) throw new Error('Supabase project connectivity is not configured in environment variables.');
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('members').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    void recordSystemEvent({ action: 'member_deleted', entity: 'member', unit_id: id, details: existingMember.name ?? 'Member deleted' });
    await fetchData();
  };

  const addActivityLog = async (logData: Omit<ActivityLog, 'id' | 'created_at'>) => {
    requirePermission(canOperateLog, 'Only admin or operator can clock members in.');
    if (!logData.workspace_id) {
      throw new Error('Activity must be tied to an activity.');
    }
    const linkedWorkspace = workspaces.find(workspace => workspace.id === logData.workspace_id);
    if (!linkedWorkspace) {
      throw new Error('Activity activity is invalid or no longer available.');
    }
    const alreadyActiveLocal = activityLogs.some(item => item.member_id === logData.member_id && item.status === 'active');
    if (alreadyActiveLocal) {
      throw new Error('Member already has an active activity for this activity. Close it first.');
    }

    const sanitizedLogData = { ...logData };

    if (isDemoMode) {
      const newActivityLog = { ...sanitizedLogData, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [newActivityLog, ...activityLogs];
      setActivityLogs(updated);
      localStorage.setItem('flow_ops_activity_logs', JSON.stringify(updated));
      void recordSystemEvent({ action: 'log_started', entity: 'log', unit_id: newActivityLog.id, details: `Activity ${newActivityLog.workspace_id} · Member ${newActivityLog.member_id}` });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();

      const activeCheck = await supabase
        .from('activity_logs')
        .select('id')
        .eq('member_id', sanitizedLogData.member_id)
        .eq('workspace_id', sanitizedLogData.workspace_id)
        .eq('status', 'active')
        .eq('org_id', orgId)
        .limit(1)
        .maybeSingle();

      if (activeCheck.error) throw activeCheck.error;
      if (activeCheck.data?.id) {
        throw new Error('Member already has an active activity for this activity. Close it first.');
      }

      const scopedActivityLogPayload = { ...sanitizedLogData, org_id: orgId };
      const { error } = await supabase.from('activity_logs').insert([scopedActivityLogPayload]);
      if (error) throw normalizeSupabaseWriteError(error);
      await fetchData();
      void recordSystemEvent({ action: 'log_started', entity: 'log', details: `Activity ${sanitizedLogData.workspace_id} · Member ${sanitizedLogData.member_id}` });
    }
  };

  const updateActivityLog = async (logData: ActivityLog) => {
    const sanitizedLogData: ActivityLog = { ...logData };
    if (isDemoMode) {
      const updated = activityLogs.map(s => s.id === sanitizedLogData.id ? sanitizedLogData : s);
      setActivityLogs(updated);
      localStorage.setItem('flow_ops_activity_logs', JSON.stringify(updated));
      void recordSystemEvent({ action: 'log_updated', entity: 'log', unit_id: sanitizedLogData.id, details: `Activity ${sanitizedLogData.workspace_id} · Member ${sanitizedLogData.member_id}` });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('activity_logs').update(sanitizedLogData).eq('id', sanitizedLogData.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
      void recordSystemEvent({ action: 'log_updated', entity: 'log', unit_id: sanitizedLogData.id, details: `Activity ${sanitizedLogData.workspace_id} · Member ${sanitizedLogData.member_id}` });
    }
  };

  const endActivityLog = async (id: string, endTime: string, duration: number, pay?: number) => {
    requirePermission(canOperateLog, 'Only admin or operator can clock members out.');
    const log = activityLogs.find(s => s.id === id);
    if (!log) return;

    const updatedActivityLog = { ...log, end_time: endTime, duration_hours: duration, total_value: pay, status: 'completed' as const };
    await updateActivityLog(updatedActivityLog);
    void recordSystemEvent({ action: 'log_ended', entity: 'log', unit_id: id, amount: pay, details: `Activity ${log.workspace_id} · Duration ${duration.toFixed(2)}h` });
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'created_at'>) => {
    requirePermission(canManageValue, 'Only admin/operator can add expenses.');
    const sanitizedExpense = sanitizeExpenseInput(expenseData);
    if (isDemoMode) {
      const newExpense = { ...sanitizedExpense, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [newExpense, ...expenses];
      setExpenses(updated);
      localStorage.setItem('flow_ops_decrements', JSON.stringify(updated));
      void recordSystemEvent({ action: 'expense_added', entity: 'expense', unit_id: newExpense.id, amount: sanitizedExpense.amount, details: sanitizedExpense.category });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();
      const scopedExpensePayload = { ...sanitizedExpense, org_id: orgId };
      const { error } = await supabase.from('expenses').insert([scopedExpensePayload]);
      if (error) throw normalizeSupabaseWriteError(error);
      void recordSystemEvent({ action: 'expense_added', entity: 'expense', amount: sanitizedExpense.amount, details: sanitizedExpense.category });
      await fetchData();
    }
  };

  const deleteExpense = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can delete expenses.');
    const existingExpense = expenses.find(item => item.id === id);
    if (isDemoMode) {
      const updated = expenses.filter(e => e.id !== id);
      setExpenses(updated);
      localStorage.setItem('flow_ops_decrements', JSON.stringify(updated));
      void recordSystemEvent({ action: 'expense_deleted', entity: 'expense', unit_id: id, amount: existingExpense?.amount, details: existingExpense?.category ?? 'Expense deleted' });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('expenses').delete().eq('id', id).eq('org_id', scopedOrgId);
      if (error) throw normalizeSupabaseWriteError(error);
      await fetchData();
      void recordSystemEvent({ action: 'expense_deleted', entity: 'expense', unit_id: id, amount: existingExpense?.amount, details: existingExpense?.category ?? 'Expense deleted' });
    }
  };

  const addAdjustment = async (adjustmentData: Omit<Adjustment, 'id' | 'created_at'>) => {
    requirePermission(canAccessAdminUi, 'Only admin can post live adjustments or retransfers.');
    const sanitizedAdjustment = sanitizeAdjustmentInput(adjustmentData);
    if (isDemoMode) {
      const newAdjustment = { ...sanitizedAdjustment, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [newAdjustment, ...adjustments];
      setAdjustments(updated);
      localStorage.setItem('flow_ops_adjustments', JSON.stringify(updated));
      void recordSystemEvent({ action: 'adjustment_recorded', entity: 'adjustment', unit_id: newAdjustment.id, amount: sanitizedAdjustment.amount, details: sanitizedAdjustment.type });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('adjustments').insert([{ ...sanitizedAdjustment, org_id: scopedOrgId }]);
      if (error) throw error;
      void recordSystemEvent({ action: 'adjustment_recorded', entity: 'adjustment', amount: sanitizedAdjustment.amount, details: sanitizedAdjustment.type });
      await fetchData();
    }
  };

  const updateAdjustment = async (adjustmentData: Adjustment) => {
    requirePermission(canAccessAdminUi, 'Only admin can update live adjustments or retransfers.');
    const sanitizedAdjustment: Adjustment = {
      ...adjustmentData,
      ...sanitizeAdjustmentInput(adjustmentData),
    };
    if (isDemoMode) {
      const updated = adjustments.map(l => l.id === sanitizedAdjustment.id ? sanitizedAdjustment : l);
      setAdjustments(updated);
      localStorage.setItem('flow_ops_adjustments', JSON.stringify(updated));
      void recordSystemEvent({ action: 'adjustment_updated', entity: 'adjustment', unit_id: sanitizedAdjustment.id, amount: sanitizedAdjustment.amount, details: sanitizedAdjustment.type });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('adjustments').update(sanitizedAdjustment).eq('id', sanitizedAdjustment.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
      void recordSystemEvent({ action: 'adjustment_updated', entity: 'adjustment', unit_id: sanitizedAdjustment.id, amount: sanitizedAdjustment.amount, details: sanitizedAdjustment.type });
    }
  };

  const deleteAdjustment = async (id: string) => {
    requirePermission(canAccessAdminUi, 'Only admin can delete live adjustment entries.');
    const existingAdjustment = adjustments.find(item => item.id === id);
    if (!existingAdjustment) return;

    if (isDemoMode) {
      const updated = adjustments.filter(item => item.id !== id);
      setAdjustments(updated);
      localStorage.setItem('flow_ops_adjustments', JSON.stringify(updated));
      void recordSystemEvent({ action: 'adjustment_deleted', entity: 'adjustment', unit_id: id, amount: existingAdjustment.amount, details: existingAdjustment.type });
      return;
    }

    if (!supabase) throw new Error('Supabase project connectivity is not configured in environment variables.');
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('adjustments').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    await fetchData();
    void recordSystemEvent({ action: 'adjustment_deleted', entity: 'adjustment', unit_id: id, amount: existingAdjustment.amount, details: existingAdjustment.type });
  };

  const addChannelEntry = async (entryData: Omit<ChannelEntry, 'id' | 'created_at'>) => {
    requirePermission(canAccessAdminUi, 'Only admin can add channel entries.');
    const sanitizedEntry = sanitizeChannelEntryInput(entryData);
    if (isDemoMode) {
      const newEntry = { ...sanitizedEntry, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [newEntry, ...channelEntries];
      setChannelEntries(updated);
      localStorage.setItem('flow_ops_channel_entries', JSON.stringify(updated));
      void recordSystemEvent({ action: 'channel_entry_added', entity: 'channel', unit_id: newEntry.id, amount: sanitizedEntry.amount, details: sanitizedEntry.type });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();
      const scopedEntryPayload = { ...sanitizedEntry, org_id: orgId };
      const { error } = await supabase.from('channel_entries').insert([scopedEntryPayload]);
      if (error) throw normalizeSupabaseWriteError(error);
      void recordSystemEvent({ action: 'channel_entry_added', entity: 'channel', amount: sanitizedEntry.amount, details: sanitizedEntry.type });
      await fetchData();
    }
  };

  const deleteChannelEntry = async (id: string) => {
    requirePermission(canAccessAdminUi, 'Only admin can delete channel entries.');
    const existingEntry = channelEntries.find(item => item.id === id);
    if (!existingEntry) return;

    if (isDemoMode) {
      const updated = channelEntries.filter(item => item.id !== id);
      setChannelEntries(updated);
      localStorage.setItem('flow_ops_channel_entries', JSON.stringify(updated));
      void recordSystemEvent({ action: 'channel_entry_deleted', entity: 'channel', unit_id: id, amount: existingEntry.amount, details: existingEntry.type });
      return;
    }

    if (!supabase) throw new Error('Supabase is not configured.');
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('channel_entries').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    await fetchData();
    void recordSystemEvent({ action: 'channel_entry_deleted', entity: 'channel', unit_id: id, amount: existingEntry.amount, details: existingEntry.type });
  };

  const addUnitAccountEntry = async (entry: Omit<UnitAccountEntry, 'id' | 'created_at'>): Promise<UnitAccountEntry> => {
    requirePermission(canManageValue, 'Only admin or operator can post entity adjustments or approved outputs.');

    const normalizedEntityId = requireNonEmpty(entry.unit_id, 'Entity');
    const normalizedType = entry.type;
    if (normalizedType === 'decrement' && !entry.request_id) {
      throw new Error('Outputs must be approved from an entity output request.');
    }
    if (normalizedType === 'decrement') {
      requirePermission(canAlign, 'Only admin can post approved entity outputs.');
    }
    const normalizedAmount = requirePositiveAmount(entry.amount, 'Entry amount');
    const normalizedDate = requireValidDate(entry.date, 'Entry date');
    const normalized: Omit<UnitAccountEntry, 'id' | 'created_at'> = {
      unit_id: normalizedEntityId,
      type: normalizedType,
      amount: normalizedAmount,
      date: normalizedDate,
      request_id: entry.request_id,
      transfer_method: entry.transfer_method?.trim() || undefined,
    };

    if (isDemoMode) {
      const created: UnitAccountEntry = {
        id: uuidv4(),
        created_at: new Date().toISOString(),
        ...normalized,
      };
      const updated = [created, ...unitAccountEntries];
      setUnitAccountEntries(updated);
      localStorage.setItem(UNIT_ACCOUNT_TX_KEY, JSON.stringify(updated));
      void recordSystemEvent({
        action: `entity_${normalizedType}_posted`,
        entity: 'unit',
        unit_id: normalizedEntityId,
        amount: normalizedAmount,
      });
      return created;
    }

    if (!supabase) throw new Error('Supabase not initialized.');
    const orgId = requireOrgScope();

    if (normalizedType === 'decrement' && entry.request_id) {
      const requestCheck = await supabase
        .from('output_requests')
        .select('id, unit_id, amount, status')
        .eq('id', entry.request_id)
        .eq('org_id', orgId)
        .single();

      if (requestCheck.error) {
        throw normalizeSupabaseWriteError(requestCheck.error);
      }

      if (!requestCheck.data || requestCheck.data.status !== 'approved') {
        throw new Error('Entity output must be approved before it can be posted.');
      }

      if (requestCheck.data.unit_id !== normalizedEntityId) {
        throw new Error('Approved request does not match the selected entity.');
      }

      if (Number(requestCheck.data.amount) !== normalizedAmount) {
        throw new Error('Approved request amount does not match the posted output.');
      }
    }

    const insertPayload = {
      ...normalized,
      org_id: orgId,
    };
    const insertRes = await supabase.from('unit_account_entries').insert([insertPayload]).select('*').single();
    if (insertRes.error) throw normalizeSupabaseWriteError(insertRes.error);
    await fetchData();
    void recordSystemEvent({
      action: `entity_${normalizedType}_posted`,
      entity: 'unit',
      unit_id: normalizedEntityId,
      amount: normalizedAmount,
    });
    return insertRes.data as UnitAccountEntry;
  };

  const requestOutput = async (
    request: Omit<OutputRequest, 'id' | 'created_at' | 'status'>,
  ): Promise<OutputRequest> => {
    requirePermission(canManageValue, 'Only admin or operator can log output requests.');

    const normalizedEntityId = requireNonEmpty(request.unit_id, 'Entity');
    const normalizedAmount = requirePositiveAmount(request.amount, 'Output request amount');
    const normalizedRequestedAt = request.requested_at || new Date().toISOString();
    const normalized: Omit<OutputRequest, 'id' | 'created_at'> = {
      unit_id: normalizedEntityId,
      amount: normalizedAmount,
      workspace_id: request.workspace_id,
      method: request.method,
      details: request.details,
      requested_at: normalizedRequestedAt,
      status: 'pending',
    };

    if (isDemoMode) {
      const created: OutputRequest = {
        id: uuidv4(),
        created_at: new Date().toISOString(),
        ...normalized,
      };

      if (canAlign) {
        created.status = 'approved';
        created.resolved_at = new Date().toISOString();
        created.resolved_by = user?.id || undefined;
      }

      const updated = [created, ...outputRequests];
      setOutputRequests(updated);
      localStorage.setItem(OUTFLOW_REQUESTS_KEY, JSON.stringify(updated));

      if (canAlign) {
        await addUnitAccountEntry({
          unit_id: created.unit_id,
          type: 'decrement',
          amount: created.amount,
          date: new Date().toISOString().split('T')[0],
          request_id: created.id,
        });
      }

      void recordSystemEvent({
        action: canAlign ? 'entity_output_approved' : 'entity_output_requested',
        entity: 'unit',
        unit_id: normalizedEntityId,
        amount: normalizedAmount,
      });
      return created;
    }

    if (!supabase) throw new Error('Supabase not initialized.');
    const orgId = requireOrgScope();
    const insertPayload: any = {
      ...normalized,
      org_id: orgId,
    };

    if (canAlign) {
      insertPayload.status = 'approved';
      insertPayload.resolved_at = new Date().toISOString();
      insertPayload.resolved_by = user?.id || undefined;
    }

    const { data: created, error } = await supabase.from('output_requests').insert([insertPayload]).select('*').single();
    if (error) throw normalizeSupabaseWriteError(error);

    if (canAlign && created) {
      await addUnitAccountEntry({
        unit_id: created.unit_id,
        type: 'decrement',
        amount: created.amount,
        date: new Date().toISOString().split('T')[0],
        request_id: created.id,
      });
    }

    await fetchData();
    void recordSystemEvent({
      action: canAlign ? 'entity_output_approved' : 'entity_output_requested',
      entity: 'unit',
      unit_id: normalizedEntityId,
      amount: normalizedAmount,
    });
    return created as OutputRequest;
  };

  const resolveOutputRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    requirePermission(canAlign, 'Only admin can approve or reject output requests.');
    const normalizedRequestId = requireNonEmpty(requestId, 'Output request');
    const existing = outputRequests.find(item => item.id === normalizedRequestId);
    if (!existing) throw new Error('Output request not found.');
    if (existing.status !== 'pending') throw new Error('Output request already resolved.');

    const resolvedPayload: Partial<OutputRequest> = {
      status: status as 'approved' | 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id || undefined,
    };

    if (isDemoMode) {
      const updatedRequests = outputRequests.map(item => (
        item.id === normalizedRequestId
          ? { ...item, ...resolvedPayload }
          : item
      ));
      setOutputRequests(updatedRequests);
      localStorage.setItem(OUTFLOW_REQUESTS_KEY, JSON.stringify(updatedRequests));
    } else {
      if (!supabase) throw new Error('Supabase not initialized.');
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase
        .from('output_requests')
        .update(resolvedPayload)
        .eq('id', normalizedRequestId)
        .eq('org_id', scopedOrgId)
        .eq('status', 'pending');
      if (error) throw normalizeSupabaseWriteError(error);
      await fetchData();
    }

    if (status === 'approved') {
      await addUnitAccountEntry({
        unit_id: existing.unit_id,
        type: 'decrement',
        amount: existing.amount,
        date: new Date().toISOString().split('T')[0],
        request_id: existing.id,
      });
    }

    void recordSystemEvent({
      action: status === 'approved' ? 'entity_output_approved' : 'entity_output_rejected',
      entity: 'unit',
      unit_id: existing.unit_id,
      amount: existing.amount,
    });
  };

  const recordOutputRequest = async (unitId: string, amount: number, workspaceId?: string, method?: string, details?: string) => {
    const normalizedEntityId = requireNonEmpty(unitId, 'Entity');
    const normalizedAmount = requirePositiveAmount(amount, 'Output amount');

    await requestOutput({
      unit_id: normalizedEntityId,
      amount: normalizedAmount,
      workspace_id: workspaceId,
      method: method,
      details: details,
      requested_at: new Date().toISOString(),
    });
  };

  const requestAdjustment = async (
    request: Omit<AdjustmentRequest, 'id' | 'created_at' | 'status'>,
  ): Promise<AdjustmentRequest> => {
    requirePermission(canManageValue, 'Only admin or operator can submit deferred entry requests.');

    const normalizedEntityId = requireNonEmpty(request.unit_id, 'Entity');
    const normalizedAmount = requirePositiveAmount(request.amount, 'Deferred entry amount');
    const normalizedRequestedAt = request.requested_at || new Date().toISOString();
    const normalizedType = request.type === 'output' ? 'output' : 'input';
    const normalized: Omit<AdjustmentRequest, 'id' | 'created_at'> = {
      unit_id: normalizedEntityId,
      amount: normalizedAmount,
      type: normalizedType,
      requested_at: normalizedRequestedAt,
      status: 'pending',
    };

    if (isDemoMode) {
      const created: AdjustmentRequest = {
        id: uuidv4(),
        created_at: new Date().toISOString(),
        ...normalized,
      };

      if (canAlign) {
        created.status = 'approved';
        created.resolved_at = new Date().toISOString();
        created.resolved_by = user?.id || undefined;
      }

      const updated = [created, ...adjustmentRequests];
      setAdjustmentRequests(updated);
      localStorage.setItem(ADJUSTMENT_REQUESTS_KEY, JSON.stringify(updated));

      if (canAlign) {
        await addAdjustment({
          unit_id: created.unit_id,
          amount: created.amount,
          type: created.type,
          date: new Date().toISOString().split('T')[0],
        });
      }

      void recordSystemEvent({
        action: canAlign ? 'adjustment_approved' : 'adjustment_requested',
        entity: 'adjustment',
        unit_id: normalizedEntityId,
        amount: normalizedAmount,
        details: normalizedType,
      });
      return created;
    }

    if (!supabase) throw new Error('Supabase not initialized.');
    const orgId = requireOrgScope();
    const insertPayload: any = {
      ...normalized,
      org_id: orgId,
    };

    if (canAlign) {
      insertPayload.status = 'approved';
      insertPayload.resolved_at = new Date().toISOString();
      insertPayload.resolved_by = user?.id || undefined;
    }

    const insertRes = await supabase.from('adjustment_requests').insert([insertPayload]).select('*').single();
    if (insertRes.error) throw normalizeSupabaseWriteError(insertRes.error);
    
    if (canAlign) {
      await addAdjustment({
        unit_id: normalizedEntityId,
        amount: normalizedAmount,
        type: normalizedType,
        date: new Date().toISOString().split('T')[0],
      });
    }

    await fetchData();
    void recordSystemEvent({
      action: canAlign ? 'adjustment_approved' : 'adjustment_requested',
      entity: 'adjustment',
      unit_id: normalizedEntityId,
      amount: normalizedAmount,
      details: normalizedType,
    });
    return insertRes.data as AdjustmentRequest;
  };

  const resolveAdjustmentRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    requirePermission(canAlign, 'Only admin can approve or reject deferred entry requests.');
    const normalizedRequestId = requireNonEmpty(requestId, 'Deferred entry request');
    const existing = adjustmentRequests.find(item => item.id === normalizedRequestId);
    if (!existing) throw new Error('Deferred entry request not found.');
    if (existing.status !== 'pending') throw new Error('Deferred entry request already resolved.');

    const resolvedPayload: Partial<AdjustmentRequest> = {
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id || undefined,
    };

    if (isDemoMode) {
      const updatedRequests = adjustmentRequests.map(item => (
        item.id === normalizedRequestId
          ? { ...item, ...resolvedPayload }
          : item
      ));
      setAdjustmentRequests(updatedRequests);
      localStorage.setItem(ADJUSTMENT_REQUESTS_KEY, JSON.stringify(updatedRequests));
    } else {
      if (!supabase) throw new Error('Supabase not initialized.');
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase
        .from('adjustment_requests')
        .update(resolvedPayload)
        .eq('id', normalizedRequestId)
        .eq('org_id', scopedOrgId)
        .eq('status', 'pending');
      if (error) throw normalizeSupabaseWriteError(error);
    }

    if (status === 'approved') {
      await addAdjustment({
        unit_id: existing.unit_id,
        amount: existing.amount,
        type: existing.type,
        date: new Date().toISOString().split('T')[0],
      });
    }

    await fetchData();

    void recordSystemEvent({
      action: status === 'approved' ? 'adjustment_approved' : 'adjustment_rejected',
      entity: 'adjustment',
      unit_id: existing.unit_id,
      amount: existing.amount,
      details: existing.type,
    });
  };

  const addTransferAccount = async (accountData: Omit<TransferAccount, 'id' | 'created_at'>) => {
    requirePermission(canAccessAdminUi, 'Only admin can add transfer accounts.');
    const sanitized = {
      ...accountData,
      name: requireNonEmpty(accountData.name?.trim(), 'Account name'),
      category: requireNonEmpty(accountData.category?.trim().toLowerCase().replace(/\s+/g, '_'), 'Account category'),
      is_active: accountData.is_active ?? true,
    };
    if (isDemoMode) {
      const newAccount: TransferAccount = { ...sanitized, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [...transferAccounts, newAccount].sort((a, b) => a.name.localeCompare(b.name));
      setTransferAccounts(updated);
      localStorage.setItem('flow_ops_transfer_accounts', JSON.stringify(updated));
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('transfer_accounts').insert([{ ...sanitized, org_id: scopedOrgId }]);
      if (error) throw error;
      await fetchData();
    }
  };

  const updateTransferAccount = async (accountData: TransferAccount) => {
    requirePermission(canAccessAdminUi, 'Only admin can update transfer accounts.');
    const sanitized: TransferAccount = {
      ...accountData,
      name: requireNonEmpty(accountData.name?.trim(), 'Account name'),
      category: requireNonEmpty(accountData.category?.trim().toLowerCase().replace(/\s+/g, '_'), 'Account category'),
      is_active: accountData.is_active ?? true,
    };
    if (isDemoMode) {
      const updated = transferAccounts.map(a => a.id === sanitized.id ? sanitized : a).sort((a, b) => a.name.localeCompare(b.name));
      setTransferAccounts(updated);
      localStorage.setItem('flow_ops_transfer_accounts', JSON.stringify(updated));
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('transfer_accounts').update(sanitized).eq('id', sanitized.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
    }
  };

  const deleteTransferAccount = async (id: string) => {
    requirePermission(canAccessAdminUi, 'Only admin can delete transfer accounts.');
    if (isDemoMode) {
      const updated = transferAccounts.filter(a => a.id !== id);
      setTransferAccounts(updated);
      localStorage.setItem('flow_ops_transfer_accounts', JSON.stringify(updated));
      return;
    }
    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('transfer_accounts').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    await fetchData();
  };

  const addAssociate = async (associateData: Omit<Associate, 'id' | 'created_at'>) => {
    const sanitizedAssociate = sanitizeAssociateInput(associateData);
    if (isDemoMode) {
      const newAssociate = { ...sanitizedAssociate, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [...associates, newAssociate];
      setAssociates(updated);
      localStorage.setItem('flow_ops_associates', JSON.stringify(updated));
      void recordSystemEvent({ action: 'associate_added', entity: 'associate', unit_id: newAssociate.id, details: newAssociate.name });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('associates').insert([{ ...toAssociateWritePayload(sanitizedAssociate), org_id: scopedOrgId }]);
      if (error) throw error;
      await fetchData();
      void recordSystemEvent({ action: 'associate_added', entity: 'associate', details: sanitizedAssociate.name });
    }
  };

  const updateAssociate = async (associateData: Associate) => {
    const sanitizedAssociate = sanitizeAssociateRecord(associateData);
    if (isDemoMode) {
      const updated = associates.map(a => a.id === sanitizedAssociate.id ? sanitizedAssociate : a);
      setAssociates(updated);
      localStorage.setItem('flow_ops_associates', JSON.stringify(updated));
      void recordSystemEvent({ action: 'associate_updated', entity: 'associate', unit_id: sanitizedAssociate.id, details: sanitizedAssociate.name });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('associates').update(toAssociateWritePayload(sanitizedAssociate)).eq('id', sanitizedAssociate.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
      void recordSystemEvent({ action: 'associate_updated', entity: 'associate', unit_id: sanitizedAssociate.id, details: sanitizedAssociate.name });
    }
  };

  const deleteAssociate = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can remove associates.');
    const existingAssociate = associates.find(item => item.id === id);
    if (!existingAssociate) return;

    const hasEntrys = associateAllocations.some(entry => entry.attributed_associate_id === id);
    if (hasEntrys) {
      throw new Error('Cannot remove associate with entry history. Remove related entries first.');
    }

    const hasReferredEntities = units.some(entity => entity.attributed_associate_id === id);
    if (hasReferredEntities) {
      throw new Error('Cannot remove associate while units are still linked. Reassign or clear unit entity links first.');
    }

    if (isDemoMode) {
      const updated = associates.filter(item => item.id !== id);
      setAssociates(updated);
      localStorage.setItem('flow_ops_associates', JSON.stringify(updated));
      void recordSystemEvent({ action: 'associate_deleted', entity: 'associate', unit_id: id, details: existingAssociate.name });
      return;
    }

    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('associates').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    await fetchData();
    void recordSystemEvent({ action: 'associate_deleted', entity: 'associate', unit_id: id, details: existingAssociate.name });
  };

  const addAssociateAllocation = async (entryData: Omit<AssociateAllocation, 'id' | 'created_at'>) => {
    requirePermission(canManageValue, 'Only admin/operator can add associate allocations.');
    const sanitizedEntry = sanitizeAssociateAllocationInput(entryData);
    if (isDemoMode) {
      const newEntry = { ...sanitizedEntry, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [newEntry, ...associateAllocations];
      setAssociateAllocations(updated);
      localStorage.setItem('flow_ops_associate_allocations', JSON.stringify(updated));
      void recordSystemEvent({ action: 'associate_allocation_added', entity: 'associate_allocation', unit_id: newEntry.id, amount: sanitizedEntry.amount, details: sanitizedEntry.type });

      // Update Associate total_number automatically
      const associate = associates.find(a => a.id === sanitizedEntry.attributed_associate_id);
      if (associate) {
        let totalChange = 0;
        if (sanitizedEntry.type === 'input') totalChange = sanitizedEntry.amount;
        else totalChange = -sanitizedEntry.amount;

        const updatedAssociate = { ...associate, total_number: (associate.total_number || 0) + totalChange };
        await updateAssociate(updatedAssociate);
      }

    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const rpcResult = await supabase.rpc('associate_record_allocation', {
        p_associate_id: sanitizedEntry.attributed_associate_id,
        p_type: sanitizedEntry.type,
        p_amount: sanitizedEntry.amount,
        p_date: sanitizedEntry.date,
        p_org_id: scopedOrgId,
      });

      if (!rpcResult.error) {
        void recordSystemEvent({ action: 'associate_allocation_added', entity: 'associate_allocation', amount: sanitizedEntry.amount, details: sanitizedEntry.type });
        await fetchData();
        return;
      }

      if (!isMissingFunctionError(rpcResult.error, 'associate_record_allocation')) {
        throw rpcResult.error;
      }

      const createdEntryRes = await supabase
        .from('associate_allocations')
        .insert([{
          ...toAssociateAllocationWritePayload(sanitizedEntry),
          org_id: scopedOrgId,
        }])
        .select('id')
        .single();
      if (createdEntryRes.error) throw createdEntryRes.error;
      void recordSystemEvent({ action: 'associate_allocation_added', entity: 'associate_allocation', unit_id: createdEntryRes.data?.id, amount: sanitizedEntry.amount, details: sanitizedEntry.type });
      
      // Manual total_number update to keep logic consistent until DB trigger is added
      const associate = associates.find(a => a.id === sanitizedEntry.attributed_associate_id);
      if (associate) {
        let totalChange = 0;
        if (sanitizedEntry.type === 'input') totalChange = sanitizedEntry.amount;
        else totalChange = -sanitizedEntry.amount;
        
        const { error: totalUpdateError } = await supabase
          .from('associates')
          .update({ total: (associate.total_number || 0) + totalChange })
          .eq('id', associate.id)
          .eq('org_id', scopedOrgId);
        if (totalUpdateError) {
          if (createdEntryRes.data?.id) {
            await supabase.from('associate_allocations').delete().eq('id', createdEntryRes.data.id).eq('org_id', scopedOrgId);
          }
          throw totalUpdateError;
        }
      }

      await fetchData();
    }
  };

  const deleteAssociateAllocation = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can remove associate allocations.');
    const existingEntry = associateAllocations.find(item => item.id === id);
    if (!existingEntry) return;

    const relatedAssociate = associates.find(item => item.id === existingEntry.attributed_associate_id);
    const reverseTotalChange = existingEntry.type === 'input'
      ? -existingEntry.amount
      : existingEntry.amount;

    if (isDemoMode) {
      const updatedEntries = associateAllocations.filter(item => item.id !== id);
      setAssociateAllocations(updatedEntries);
      localStorage.setItem('flow_ops_associate_allocations', JSON.stringify(updatedEntries));

      if (relatedAssociate) {
        const updatedAssociates = associates.map(item =>
          item.id === relatedAssociate.id
            ? { ...item, total_number: (item.total_number || 0) + reverseTotalChange }
            : item
        );
        setAssociates(updatedAssociates);
        localStorage.setItem('flow_ops_associates', JSON.stringify(updatedAssociates));
      }

      void recordSystemEvent({ action: 'associate_allocation_deleted', entity: 'associate_allocation', unit_id: id, amount: existingEntry.amount, details: existingEntry.type });
      return;
    }

    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error: deleteError } = await supabase.from('associate_allocations').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (deleteError) throw normalizeSupabaseWriteError(deleteError);

    if (relatedAssociate) {
      const { error: totalUpdateError } = await supabase
        .from('associates')
          .update({ total: (relatedAssociate.total_number || 0) + reverseTotalChange })
          .eq('id', relatedAssociate.id)
          .eq('org_id', scopedOrgId);

      if (totalUpdateError) {
        await supabase.from('associate_allocations').insert([{
          ...toAssociateAllocationWritePayload(existingEntry),
          org_id: scopedOrgId,
        }]);
    throw normalizeSupabaseWriteError(totalUpdateError);
      }
    }

    await fetchData();
    void recordSystemEvent({ action: 'associate_allocation_deleted', entity: 'associate_allocation', unit_id: id, amount: existingEntry.amount, details: existingEntry.type });
  };

  const fetchAvailableOrgs = async () => {
    if (role !== 'admin' || isDemoMode || !supabase) return;
    try {
      if (user?.id) {
        const authority = await getUserAuthorityContext(user.id);
        if (authority.managedOrgIds.length > 0) {
          setManagedOrgIds((current) => Array.from(new Set([...current, ...authority.managedOrgIds])));
        }
      }

      const accessToken = await getSupabaseAccessToken();
      if (!accessToken) return;

      const { data, error } = await supabase.functions.invoke('manage-meta-org-admins', {
        body: {
          action: 'list-org-contexts',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        }
      });

      if (!error && data?.managed_org_ids) {
        setManagedOrgIds((current) => Array.from(new Set([...current, ...data.managed_org_ids])));
      }
    } catch (err) {
      console.error('Failed to fetch available orgs:', err);
    }
  };

  const updateProfileOrgId = async (orgId: string | null) => {
    if (!canAccessAdminUi) throw new Error('Only admin accounts can switch organization clusters.');
    if (!user) throw new Error('You must be signed in to switch organization context.');

    if (isDemoMode) {
      setActiveOrgId(orgId);
      return;
    }

    if (!supabase) return;
    
    const accessToken = await getSupabaseAccessToken();
    if (!accessToken) throw new Error('Authentication session expired.');

    const { data, error: functionError } = await supabase.functions.invoke('manage-meta-org-admins', {
      body: {
        action: 'switch-org-context',
        org_id: orgId,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      }
    });

    if (functionError) throw new Error(functionError.message || 'Failed to switch organization cluster.');

    if (Object.prototype.hasOwnProperty.call(data ?? {}, 'org_id')) {
      updateActiveOrgId(data?.org_id ?? null);
    } else {
      updateActiveOrgId(orgId);
    }

    if (Object.prototype.hasOwnProperty.call(data ?? {}, 'meta_org_id')) {
      updateActiveMetaOrgId(data?.meta_org_id ?? null);
    }

    if (user?.id && orgId) {
      const { data: membershipRow } = await supabase
        .from('org_memberships')
        .select('id')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .maybeSingle();

      if (membershipRow?.id) {
        await supabase
          .from('org_memberships')
          .update({ is_default_org: false })
          .eq('user_id', user.id)
          .neq('org_id', orgId);

        await supabase
          .from('org_memberships')
          .update({ is_default_org: true, status: 'active' })
          .eq('user_id', user.id)
          .eq('org_id', orgId);
      }
    }

    if (data?.managed_org_ids) {
      setManagedOrgIds(data.managed_org_ids);
    }
    
    // Clear the profiles cache to trigger reload
    profilesUnavailableRef.current = false;
    await fetchData();
  };

  const provisionProfileOrgContext = async (): Promise<ProvisionOrgContextResult> => {
    if (!canAccessAdminUi) throw new Error('Only admin accounts can provision workspace clusters.');
    if (!user) throw new Error('You must be signed in to provision organization context.');

    if (isDemoMode) {
      const orgId = crypto.randomUUID();
      setActiveOrgId(orgId);
      return {
        org_id: orgId,
        meta_org_id: null,
        managed_org_ids: [orgId],
      };
    }

    if (!supabase) throw new Error('Supabase project connectivity is not configured in environment variables.');

    const accessToken = await getSupabaseAccessToken();
    if (!accessToken) throw new Error('Authentication session expired.');

    const { data, error: functionError } = await supabase.functions.invoke('manage-meta-org-admins', {
      body: {
        action: 'provision-org-context',
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      }
    });

    if (functionError) throw new Error(functionError.message || 'Failed to provision fresh workspace cluster.');

    updateActiveOrgId(data.org_id);
    
    if (data?.meta_org_id) {
      updateActiveMetaOrgId(data.meta_org_id);
    }

    if (data?.managed_org_ids) {
      setManagedOrgIds(data.managed_org_ids);
    } else {
      setManagedOrgIds((current) => current.includes(data.org_id) ? current : [...current, data.org_id]);
    }

    profilesUnavailableRef.current = false;
    await fetchData();

    return {
      org_id: data.org_id,
      meta_org_id: data.meta_org_id ?? null,
      managed_org_ids: data.managed_org_ids ?? [data.org_id],
    };
  };

  const contextValue: DataContextType = {
    units,
    workspaces,
    entries,
    members,
    activityLogs,
    expenses,
    adjustments,
    adjustmentRequests,
    channelEntries,
    unitAccountEntries,
    outputRequests,
    transferAccounts,
    associates,
    associateAllocations,
    systemEvents,
    operatorLogs,
    activeOrgId,
    setActiveOrgId,
    loading,
    loadingProgress,
    isDemoMode,
    addUnit,
    updateUnit,
    deleteUnit,
    importUnits,
    transferUnitTotal,
    recordOutputRequest,
    addUnitAccountEntry,
    requestOutput,
    resolveOutputRequest,
    requestAdjustment,
    resolveAdjustmentRequest,
    addWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addEntry,
    updateEntry,
    deleteEntry,
    addMember,
    updateMember,
    importMembers,
    deleteMember,
    addActivityLog,
    updateActivityLog,
    endActivityLog,
    addExpense,
    deleteExpense,
    addAdjustment,
    updateAdjustment,
    deleteAdjustment,
    addChannelEntry,
    deleteChannelEntry,
    transferChannelValues,
    addTransferAccount,
    updateTransferAccount,
    deleteTransferAccount,
    addAssociate,
    updateAssociate,
    deleteAssociate,
    addAssociateAllocation,
    deleteAssociateAllocation,
    updateProfileOrgId,
    provisionProfileOrgContext,
    managedOrgIds,
    metaOrgId: activeMetaOrgId,
    recordSystemEvent: recordSystemEvent,
    refreshData: fetchData,
  };

  lastKnownDataContextValue = contextValue;

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    if (import.meta.env.DEV && lastKnownDataContextValue) {
      if (!hasWarnedDataContextFallback) {
        hasWarnedDataContextFallback = true;
        console.warn('useData fallback engaged: DataProvider context was temporarily unavailable during development hot reload.');
      }
      return lastKnownDataContextValue;
    }
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
