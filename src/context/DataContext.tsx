import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured, getSupabase, SUPABASE_ANON_KEY } from '../lib/supabase';
import { Unit, Workspace, Entry, Member, ActivityLog, Expense, Adjustment, AdjustmentRequest, ChannelEntry, Partner, PartnerEntry, SystemEvent, OperatorLog, TransferAccount, UnitAccountEntry, OutputRequest } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { APP_MIN_DATE, isDateOnOrAfter, isValidIsoDate } from '../lib/utils';
import { DbRole, appRoleToDbRole, dbRoleToAppRole } from '../lib/roles';
import { useAppRole } from './AppRoleContext';
import { useAuth } from './AuthContext';
import { isAllowedWorkspaceStatusTransition, normalizeWorkspaceStatus } from '../lib/activityRules';

interface DataContextType {
  units: Unit[];
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
  partners: Partner[];
  partnerEntries: PartnerEntry[];
  systemEvents: SystemEvent[];
  operatorLogs: OperatorLog[];
  activeOrgId: string | null;
  setActiveOrgId: (id: string | null) => void;
  loading: boolean;
  loadingProgress: number;
  isDemoMode: boolean;
  
  // Expense Actions
  addUnit: (unit: Omit<Unit, 'id' | 'created_at'>) => Promise<string>;
  updateUnit: (unit: Unit) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  importUnits: (units: Omit<Unit, 'id' | 'created_at'>[]) => Promise<void>;
  transferUnitTotal: (fromUnitId: string, toUnitId: string, amount: number) => Promise<void>;
  transferChannelValues: (fromMethod: string, toMethod: string, amount: number, date: string) => Promise<string>;
  recordOutputRequest: (unitId: string, amount: number, workspaceId?: string, method?: string, details?: string) => Promise<void>;
  addUnitAccountEntry: (entry: Omit<UnitAccountEntry, 'id' | 'created_at'>) => Promise<UnitAccountEntry>;
  requestOutput: (request: Omit<OutputRequest, 'id' | 'created_at' | 'status'>) => Promise<OutputRequest>;
  resolveOutputRequest: (requestId: string, status: 'approved' | 'rejected') => Promise<void>;
  requestAdjustment: (request: Omit<AdjustmentRequest, 'id' | 'created_at' | 'status'>) => Promise<AdjustmentRequest>;
  resolveAdjustmentRequest: (requestId: string, status: 'approved' | 'rejected') => Promise<void>;
  
  // Workspace Actions
  addWorkspace: (workspace: Omit<Workspace, 'id' | 'created_at'>) => Promise<string>;
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

  // Partner Actions
  addPartner: (partner: Omit<Partner, 'id' | 'created_at'>) => Promise<void>;
  updatePartner: (partner: Partner) => Promise<void>;
  deletePartner: (id: string) => Promise<void>;
  addPartnerEntry: (entry: Omit<PartnerEntry, 'id' | 'created_at'>) => Promise<void>;
  deletePartnerEntry: (id: string) => Promise<void>;
  updateProfileOrgId: (orgId: string | null) => Promise<void>;
  provisionProfileOrgContext: () => Promise<void>;
  managedOrgIds: string[];
  recordSystemEvent: (event: Omit<SystemEvent, 'id' | 'timestamp' | 'actor_role'>) => Promise<void>;

  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);
let lastKnownDataContextValue: DataContextType | undefined;
let hasWarnedDataContextFallback = false;

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [units, setUnits] = useState<Unit[]>([]);
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
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerEntries, setPartnerEntries] = useState<PartnerEntry[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [operatorLogs, setOperatorLogs] = useState<OperatorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
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
  const missingWorkspacesRef = useRef<Set<string>>(new Set());
  const unitPartnerColumnUnavailableRef = useRef(false);
  const entriesActivityUnitsColumnUnavailableRef = useRef(false);
  const entriesUnavailableColumnsRef = useRef<Set<string>>(new Set());

  const profilesUnavailableRef = useRef(false);
  const [managedOrgIds, setManagedOrgIds] = useState<string[]>([]);
  const auditEventsUnavailableRef = useRef(false);
  const outputRequestsUnavailableRef = useRef(false);
  const operatorLogsUnavailableRef = useRef(false);
  const { role, canAccessAdminUi, canOperateLog, canManageValue, canAlign } = useAppRole();
  const { user } = useAuth();

  const isDemoMode = !isSupabaseConfigured;
  const AUDIT_EVENTS_KEY = 'flow_ops_audit_events_v2';
  const UNIT_ACCOUNT_TX_KEY = 'flow_ops_unit_account_entrys_v1';
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
    if (columnName === 'activity_count') {
      entriesActivityUnitsColumnUnavailableRef.current = true;
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

    if (entriesActivityUnitsColumnUnavailableRef.current && 'activity_count' in next) {
      delete next.activity_count;
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

  const getFreshAccessToken = async () => {
    if (!supabase) return null;

    const { data: sessionData } = await supabase.auth.getSession();
    let accessToken = sessionData.session?.access_token ?? null;

    if (!accessToken) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        throw new Error(`Authentication session expired: ${refreshError.message}`);
      }
      accessToken = refreshData.session?.access_token ?? null;
    }

    return accessToken;
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

  const requireOrgScope = () => {
    if (isDemoMode) return null;
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

  const appendSystemEvent = async (event: Omit<SystemEvent, 'id' | 'timestamp' | 'actor_role'>) => {
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
      p_entity_id: event.entity_id ?? null,
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
    if (operation === 'add' && workspace.status !== 'active') throw new Error('Units can only be added while activity is active.');
  };

  const sanitizeUnitInput = (unitData: Omit<Unit, 'id' | 'created_at'>) => ({
    ...unitData,
    name: unitData.name?.trim() ?? '',
    tags: unitData.tags?.map(tag => tag.trim()).filter(Boolean) ?? [],
  });

  const stripUnitPartnerColumn = <T extends { referred_by_partner_id?: string | undefined }>(
    payload: T,
  ): Omit<T, 'referred_by_partner_id'> => {
    const { referred_by_partner_id, ...rest } = payload;
    return rest;
  };

  const stripEntriesActivityCountColumn = <T extends { activity_count?: number | undefined }>(
    payload: T,
  ): Omit<T, 'activity_count'> => {
    const { activity_count, ...rest } = payload;
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

  const normalizePartnerRole = (value: unknown): Partner['role'] => {
    const rawRole = String(value ?? '').trim().toLowerCase();
    if (rawRole === 'partner' || rawRole === 'referrer') return 'partner';
    if (rawRole === 'channel' || rawRole === 'viewer' || rawRole === 'operator' || rawRole === 'operator') return 'channel';
    if (rawRole === 'hybrid' || rawRole === 'both') return 'hybrid';
    return 'channel';
  };



  const sanitizePartnerInput = (partnerData: Omit<Partner, 'id' | 'created_at'>) => {
    return {
      ...partnerData,
      name: partnerData.name?.trim() ?? '',
      partner_arrangement_rate: typeof partnerData.partner_arrangement_rate === 'number' && Number.isFinite(partnerData.partner_arrangement_rate) ? Math.max(0, partnerData.partner_arrangement_rate) : 0,
      system_allocation_percent: typeof partnerData.system_allocation_percent === 'number' && Number.isFinite(partnerData.system_allocation_percent) ? Math.max(0, partnerData.system_allocation_percent) : 0,
      role: normalizePartnerRole(partnerData.role),
      status: partnerData.status ?? 'active',
    };
  };

  const sanitizePartnerRecord = (
    partnerData: Partner | (Partial<Partner> & { id: string; name: string; role: Partner['role']; status: Partner['status']; total: number; contact?: string | null })
  ): Partner => {
    return {
      ...partnerData,
      name: partnerData.name?.trim() ?? '',
      partner_arrangement_rate: typeof partnerData.partner_arrangement_rate === 'number' && Number.isFinite(partnerData.partner_arrangement_rate) ? Math.max(0, partnerData.partner_arrangement_rate) : 0,
      system_allocation_percent: typeof partnerData.system_allocation_percent === 'number' && Number.isFinite(partnerData.system_allocation_percent) ? Math.max(0, partnerData.system_allocation_percent) : 0,
      role: normalizePartnerRole(partnerData.role),
      status: partnerData.status ?? 'active',
    } as Partner;
  };

  type StoredPartnerEntryType = PartnerEntry['type'];

  const normalizePartnerEntryType = (value: unknown): StoredPartnerEntryType => {
    const rawType = String(value ?? '').trim().toLowerCase();
    if (rawType === 'input') return 'input';
    if (rawType === 'closure') return 'closure';
    if (rawType === 'output') return 'output';
    if (rawType === 'adjustment') return 'adjustment';
    return 'input';
  };

  const normalizePartnerEntryRecord = (entry: PartnerEntry): PartnerEntry => ({
    ...entry,
    type: normalizePartnerEntryType(entry.type),
  });

  const sanitizePartnerEntryInput = (entryData: Omit<PartnerEntry, 'id' | 'created_at'>) => ({
    ...entryData,
    type: normalizePartnerEntryType(entryData.type),
    amount: requirePositiveAmount(entryData.amount, 'Entry amount'),
    date: requireValidDate(entryData.date, 'Partner entry date'),
  });

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
    const serviceRate = typeof member.service_rate === 'number' && Number.isFinite(member.service_rate)
      ? member.service_rate
      : undefined;
    const retainerRate = typeof member.retainer_rate === 'number' && Number.isFinite(member.retainer_rate)
      ? member.retainer_rate
      : undefined;

    return {
      ...member,
      arrangement_type: incentiveType,
      service_rate: serviceRate,
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
    setPartners([]);
    setPartnerEntries([]);
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
    entity_id?: string | null;
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
      entity_id: item.entity_id ?? undefined,
      amount: item.amount ?? undefined,
      details: item.details ?? undefined,
    }));
  };

  const loadProfileContext = async (): Promise<string | null> => {
    if (!supabase) return null;

    let resolvedOrgId: string | null = null;

    if (user && !profilesUnavailableRef.current && !hasMissingWorkspace('profiles')) {
      const { data: profileRelData, error: profileRelError } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
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
      }
    } else {
      resolvedOrgId = null;
      setActiveOrgId(null);
    }

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
        partnersRes,
        partnerTransRes,
        transferAccountsRes,
      ] = await Promise.all([
        queryWorkspace<ActivityLog>('activity_logs', () => client.from('activity_logs').select('*').order('start_time', { ascending: false })),
        queryWorkspace<Expense>('expenses', () => client.from('expenses').select('*').order('date', { ascending: false })),
        queryWorkspace<Adjustment>('adjustments', () => client.from('adjustments').select('*').order('date', { ascending: false })),
        queryWorkspace<AdjustmentRequest>('adjustment_requests', () => client.from('adjustment_requests').select('*').order('requested_at', { ascending: false })),
        queryWorkspace<ChannelEntry>('channel_entries', () => client.from('channel_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<UnitAccountEntry>('unit_account_entrys', () => client.from('unit_account_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<OutputRequest>('output_requests', () => client.from('output_requests').select('*').order('requested_at', { ascending: false })),
        queryWorkspace<Partner>('partners', () => client.from('partners').select('*').order('name')),
        queryWorkspace<PartnerEntry>('partner_entries', () => client.from('partner_entries').select('*').order('date', { ascending: false })),
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
      setPartners(resolveRows<Partner>(partnersRes, 'partners').map(sanitizePartnerRecord));
      setPartnerEntries(resolveRows<PartnerEntry>(partnerTransRes, 'partner_entries').map(normalizePartnerEntryRecord));
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
            .select('id, created_at, actor_user_id, actor_label, actor_role, action, entity, entity_id, amount, details, operator_activity_id')
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
        queryWorkspace<Unit>('units', () => client.from('units').select('*').order('name')),
        queryWorkspace<Workspace>('workspaces', () => client.from('workspaces').select('*').order('date', { ascending: false })),
        queryWorkspace<Entry>('entries', () => client.from('entries').select('*')),
        queryWorkspace<Member>('members', () => client.from('members').select('*').order('name')),
      ]);

      if (fetchVersion !== fetchVersionRef.current) {
        finalizeLoading();
        return;
      }

      setUnits(resolveRows<Unit>(unitsRes, 'units'));
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

  const fetchData = async () => {
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
        partnersRes,
        partnerTransRes,
        auditEventsRes,
        operatorLogsRes,
        transferAccountsRes,
      ] = await Promise.all([
        queryWorkspace<Unit>('units', () => client.from('units').select('*').order('name')),
        queryWorkspace<Workspace>('workspaces', () => client.from('workspaces').select('*').order('date', { ascending: false })),
        queryWorkspace<Entry>('entries', () => client.from('entries').select('*')),
        queryWorkspace<Member>('members', () => client.from('members').select('*').order('name')),
        queryWorkspace<ActivityLog>('activity_logs', () => client.from('activity_logs').select('*').order('start_time', { ascending: false })),
        queryWorkspace<Expense>('expenses', () => client.from('expenses').select('*').order('date', { ascending: false })),
        queryWorkspace<Adjustment>('adjustments', () => client.from('adjustments').select('*').order('date', { ascending: false })),
        queryWorkspace<AdjustmentRequest>('adjustment_requests', () => client.from('adjustment_requests').select('*').order('requested_at', { ascending: false })),
        queryWorkspace<ChannelEntry>('channel_entries', () => client.from('channel_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<UnitAccountEntry>('unit_account_entrys', () => client.from('unit_account_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<OutputRequest>('output_requests', () => client.from('output_requests').select('*').order('requested_at', { ascending: false })),
        queryWorkspace<Partner>('partners', () => client.from('partners').select('*').order('name')),
        queryWorkspace<PartnerEntry>('partner_entries', () => client.from('partner_entries').select('*').order('date', { ascending: false })),
        queryWorkspace<AuditEventRow>('audit_events', () =>
          client
            .from('audit_events')
            .select('id, created_at, actor_user_id, actor_label, actor_role, action, entity, entity_id, amount, details, operator_activity_id')
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
        queryWorkspace<TransferAccount>('transfer_accounts', () => client.from('transfer_accounts').select('*').order('name')),
      ]);

      if (fetchVersion !== fetchVersionRef.current) return;

      const unitsData = resolveRows<Unit>(unitsRes, 'units');
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
      const partnersData = resolveRows<Partner>(partnersRes, 'partners').map(sanitizePartnerRecord);
      const partnerTransData = resolveRows<PartnerEntry>(partnerTransRes, 'partner_entries').map(normalizePartnerEntryRecord);
      const transferAccountsData = resolveRows<TransferAccount>(transferAccountsRes, 'transfer_accounts');
      const auditRows = resolveRows<AuditEventRow>(auditEventsRes, 'audit_events');
      const operatorLogsRows = resolveRows<OperatorLogRow>(operatorLogsRes, OPERATOR_ACTIVITY_WORKSPACE);
      const auditEventsData = mapAuditRowsToSystemEvents(auditRows);
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
      setPartners(partnersData);
      setPartnerEntries(partnerTransData);
      setTransferAccounts(transferAccountsData);
      setSystemEvents(auditEventsData);
      setOperatorLogs(operatorLogsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      completeLoadingProgress();
    }
  };

  useEffect(() => {
    void fetchDataStaged();
  }, [user?.id, role]);

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
      void appendSystemEvent({ action: 'operator_log_started', entity: 'log', entity_id: operatorLogId, details: `${username} signed in` });
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

  const addUnit = async (unitData: Omit<Unit, 'id' | 'created_at'>): Promise<string> => {
    const sanitizedUnit = sanitizeUnitInput(unitData);
    if (isDemoMode) {
      const newUnit = { ...sanitizedUnit, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [...units, newUnit];
      setUnits(updated);
      localStorage.setItem('flow_ops_units', JSON.stringify(updated));
      void appendSystemEvent({ action: 'unit_added', entity: 'unit', entity_id: newUnit.id, details: newUnit.name });
      return newUnit.id;
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) throw new Error('Supabase not initialized');
      const insertPayload = {
        ...sanitizedUnit,
        org_id: scopedOrgId,
        ...(unitPartnerColumnUnavailableRef.current ? {} : { referred_by_partner_id: sanitizedUnit.referred_by_partner_id })
      };

      const insertResult = await supabase.from('units').insert([insertPayload]).select('id').single();
      if (insertResult.error) {
        const error = insertResult.error;
        if (isMissingColumnError(error, 'units', 'referred_by_partner_id')) {
          unitPartnerColumnUnavailableRef.current = true;
          warnOnce(
            'missing-units-referred-by-partner-id',
            'Supabase units.referred_by_partner_id column is missing. Unit writes will continue without partner linkage until migration is applied.',
            error.message ?? undefined,
          );
          const fallbackPayload = stripUnitPartnerColumn(sanitizedUnit);
          const fallbackResult = await supabase.from('units').insert([{ ...fallbackPayload, org_id: scopedOrgId }]).select('id').single();
          if (fallbackResult.error) throw fallbackResult.error;
          if (!fallbackResult.data?.id) throw new Error('Unit was created but no id was returned.');
          await fetchData();
          void appendSystemEvent({ action: 'unit_added', entity: 'unit', entity_id: fallbackResult.data.id, details: sanitizedUnit.name });
          return fallbackResult.data.id;
        } else {
          throw error;
        }
      }
      if (!insertResult.data?.id) throw new Error('Unit was created but no id was returned.');
      await fetchData();
      void appendSystemEvent({ action: 'unit_added', entity: 'unit', entity_id: insertResult.data.id, details: sanitizedUnit.name });
      return insertResult.data.id;
    }
  };

  const importUnits = async (newUnitsData: Omit<Unit, 'id' | 'created_at'>[]) => {
    const sanitizedUnits = newUnitsData.map(sanitizeUnitInput);
    if (isDemoMode) {
      const newUnits = sanitizedUnits.map(p => ({
        ...p,
        id: uuidv4(),
        created_at: new Date().toISOString()
      }));
      const updated = [...units, ...newUnits];
      setUnits(updated);
      localStorage.setItem('flow_ops_units', JSON.stringify(updated));
      void appendSystemEvent({ action: 'units_imported', entity: 'unit', amount: newUnits.length, details: `${newUnits.length} units imported` });
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) return;
      const insertPayload = sanitizedUnits.map(unit => ({
        ...unit,
        org_id: scopedOrgId,
        ...(unitPartnerColumnUnavailableRef.current ? {} : { referred_by_partner_id: unit.referred_by_partner_id })
      }));

      const { error } = await supabase.from('units').insert(insertPayload);
      if (error) {
        if (isMissingColumnError(error, 'units', 'referred_by_partner_id')) {
          unitPartnerColumnUnavailableRef.current = true;
          warnOnce(
            'missing-units-referred-by-partner-id',
            'Supabase units.referred_by_partner_id column is missing. Unit writes will continue without partner linkage until migration is applied.',
            error.message ?? undefined,
          );
          const fallbackPayload = sanitizedUnits.map(item => ({ ...stripUnitPartnerColumn(item), org_id: scopedOrgId }));
          const fallbackResult = await supabase.from('units').insert(fallbackPayload);
          if (fallbackResult.error) throw fallbackResult.error;
        } else {
          throw error;
        }
      }
      await fetchData();
      void appendSystemEvent({ action: 'units_imported', entity: 'unit', amount: sanitizedUnits.length, details: `${sanitizedUnits.length} units imported` });
    }
  };

  const updateUnit = async (unit: Unit) => {
    const sanitizedUnit = sanitizeUnitInput(unit);
    if (isDemoMode) {
      const updated = units.map(p => p.id === unit.id ? { ...unit, ...sanitizedUnit } : p);
      setUnits(updated);
      localStorage.setItem('flow_ops_units', JSON.stringify(updated));
      void appendSystemEvent({ action: 'unit_updated', entity: 'unit', entity_id: unit.id, details: unit.name });
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) return;
      const updatePayload = {
        ...sanitizedUnit,
        org_id: scopedOrgId,
        ...(unitPartnerColumnUnavailableRef.current ? {} : { referred_by_partner_id: sanitizedUnit.referred_by_partner_id })
      };

      const { error } = await supabase.from('units').update(updatePayload).eq('id', unit.id).eq('org_id', scopedOrgId);
      if (error) {
        if (isMissingColumnError(error, 'units', 'referred_by_partner_id')) {
          unitPartnerColumnUnavailableRef.current = true;
          warnOnce(
            'missing-units-referred-by-partner-id',
            'Supabase units.referred_by_partner_id column is missing. Unit writes will continue without partner linkage until migration is applied.',
            error.message ?? undefined,
          );
          const fallbackPayload = stripUnitPartnerColumn({ ...unit, ...sanitizedUnit });
          const fallbackResult = await supabase.from('units').update({ ...fallbackPayload, org_id: scopedOrgId }).eq('id', unit.id).eq('org_id', scopedOrgId);
          if (fallbackResult.error) throw fallbackResult.error;
        } else {
          throw error;
        }
      }
      await fetchData();
      void appendSystemEvent({ action: 'unit_updated', entity: 'unit', entity_id: unit.id, details: unit.name });
    }
  };

  const deleteUnit = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can delete unit profiles.');

    const existingUnit = units.find(unit => unit.id === id);
    if (!existingUnit) return;

    const hasActiveActivityEntry = entries.some(entry => entry.unit_id === id && !entry.left_at);
    if (hasActiveActivityEntry) {
      throw new Error('Cannot delete unit with an active activity. Output and remove from workspace first.');
    }

    const hasEntriesHistory = entries.some(entry => entry.unit_id === id);
    if (hasEntriesHistory) {
      throw new Error('Cannot delete unit with activity history. Remove related entries entries first.');
    }

    const hasAdjustmentHistory = adjustments.some(adjustment => adjustment.unit_id === id);
    if (hasAdjustmentHistory) {
      throw new Error('Cannot delete unit with adjustment history. Resolve or remove related adjustment records first.');
    }

    if (isDemoMode) {
      const updatedUnits = units.filter(unit => unit.id !== id);
      setUnits(updatedUnits);
      localStorage.setItem('flow_ops_units', JSON.stringify(updatedUnits));
      void appendSystemEvent({ action: 'unit_deleted', entity: 'unit', entity_id: id, details: existingUnit.name ?? 'Unit deleted' });
      return;
    }

    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('units').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    void appendSystemEvent({ action: 'unit_deleted', entity: 'unit', entity_id: id, details: existingUnit.name ?? 'Unit deleted' });
    await fetchData();
  };

  const transferUnitTotal = async (fromUnitId: string, toUnitId: string, amount: number) => {
    requirePermission(canAlign, 'Only admin can transfer unit totals.');
    if (fromUnitId === toUnitId) throw new Error('Select two different units for transfer.');
    requirePositiveAmount(amount, 'Transfer amount');

    const fromUnit = units.find(unit => unit.id === fromUnitId);
    const toUnit = units.find(unit => unit.id === toUnitId);
    if (!fromUnit || !toUnit) throw new Error('One or both selected units were not found.');

    const fromTotal = fromUnit.total ?? 0;
    const toTotal = toUnit.total ?? 0;
    if (fromTotal < amount) {
      throw new Error('Insufficient total for transfer.');
    }

    const updatedFrom: Unit = { ...fromUnit, total: fromTotal - amount };
    const updatedTo: Unit = { ...toUnit, total: toTotal + amount };

    if (!isDemoMode && supabase) {
      const scopedOrgId = requireOrgScope();
      const rpcAttempt = await supabase.rpc('unit_total_transfer', {
        p_from_unit_id: fromUnitId,
        p_to_unit_id: toUnitId,
        p_amount: amount,
        p_note: null,
        p_org_id: scopedOrgId,
      });

      if (!rpcAttempt.error) {
        await fetchData();
        void appendSystemEvent({
          action: 'unit_total_transfer',
          entity: 'entries',
          amount,
          details: `${fromUnit.name || fromUnit.id} → ${toUnit.name || toUnit.id}`,
        });
        return;
      }

      if (!isMissingFunctionError(rpcAttempt.error, 'unit_total_transfer')) {
        throw rpcAttempt.error;
      }
    }

    if (isDemoMode) {
      const updated = units.map(unit => {
        if (unit.id === updatedFrom.id) return updatedFrom;
        if (unit.id === updatedTo.id) return updatedTo;
        return unit;
      });
      setUnits(updated);
      localStorage.setItem('flow_ops_units', JSON.stringify(updated));
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();

      const updateUnitRecord = async (unitRecord: Unit) => {
        const client = supabase;
        if (!client) return;
        const updatePayload = unitPartnerColumnUnavailableRef.current
          ? stripUnitPartnerColumn(unitRecord)
          : unitRecord;
        const { error } = await client.from('units').update({ ...updatePayload, org_id: scopedOrgId }).eq('id', unitRecord.id).eq('org_id', scopedOrgId);
        if (error) {
          if (isMissingColumnError(error, 'units', 'referred_by_partner_id')) {
            unitPartnerColumnUnavailableRef.current = true;
            warnOnce(
              'missing-units-referred-by-partner-id',
              'Supabase units.referred_by_partner_id column is missing. Unit writes will continue without partner linkage until migration is applied.',
              error.message ?? undefined,
            );
            const fallbackPayload = stripUnitPartnerColumn(unitRecord);
            const fallbackResult = await client.from('units').update({ ...fallbackPayload, org_id: scopedOrgId }).eq('id', unitRecord.id).eq('org_id', scopedOrgId);
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
        await updateUnitRecord(fromUnit);
        throw error;
      }

      await fetchData();
    }

    void appendSystemEvent({
      action: 'unit_total_transfer',
      entity: 'entries',
      amount,
      details: `${fromUnit.name || fromUnit.id} → ${toUnit.name || toUnit.id}`,
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
      void appendSystemEvent({
        action: 'channel_transfer',
        entity: 'channel',
        entity_id: transferId,
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
      void appendSystemEvent({
        action: 'channel_transfer',
        entity: 'channel',
        entity_id: transferId,
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
    void appendSystemEvent({
      action: 'channel_transfer',
      entity: 'channel',
      entity_id: transferId,
      amount: normalizedAmount,
      details: `${sourceMethod} → ${destinationMethod}`,
    });
    return transferId;
  };

  const addWorkspace = async (workspaceData: Omit<Workspace, 'id' | 'created_at'>): Promise<string> => {
    requirePermission(canOperateLog, 'Only admin or operator can create activitys.');
    if (!workspaceData.date) throw new Error('Workspace date is required.');
    requireValidDate(workspaceData.date, 'Workspace date');
    const normalizedWorkspaceData: Omit<Workspace, 'id' | 'created_at'> = {
      ...workspaceData,
      status: normalizeWorkspaceStatus(workspaceData.status),
      org_code: requireValidOrgCode(workspaceData.org_code),
    };
    if (isDemoMode) {
      const newWorkspace = normalizeWorkspaceLifecycle({ ...normalizedWorkspaceData, id: uuidv4(), created_at: new Date().toISOString() });
      const updated = [newWorkspace, ...workspaces];
      setWorkspaces(updated);
      localStorage.setItem('flow_ops_workspaces', JSON.stringify(updated));
      void appendSystemEvent({ action: 'activity_created', entity: 'workspace', entity_id: newWorkspace.id, details: `Status: ${newWorkspace.status}` });
      return newWorkspace.id;
    } else {
      const scopedOrgId = requireOrgScope();
      if (!supabase) throw new Error("Supabase not initialized");
      const insertResult = await supabase.from('workspaces').insert([{ ...normalizedWorkspaceData, org_id: scopedOrgId }]).select();
      if (insertResult.error) throw insertResult.error;
      const { data } = insertResult;
      if (!data || data.length === 0) throw new Error('Workspace creation succeeded but no workspace id was returned.');
      void appendSystemEvent({ action: 'activity_created', entity: 'workspace', entity_id: data[0].id, details: `Status: ${normalizedWorkspaceData.status}` });
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
      void appendSystemEvent({ action: 'activity_status_changed', entity: 'workspace', entity_id: normalizedWorkspace.id, details: `${existingWorkspace.status} → ${normalizedWorkspace.status}` });
    }
  };

  const deleteWorkspace = async (id: string) => {
    requirePermission(canOperateLog, 'Only admin or operator can delete activitys.');
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

    void appendSystemEvent({ action: 'activity_deleted', entity: 'workspace', entity_id: id, details: existingWorkspace ? `Deleted ${existingWorkspace.status} activity` : 'Activity deleted' });
  };

  const addEntry = async (entryData: Omit<Entry, 'id' | 'created_at' | 'net'>) => {
    requirePermission(canOperateLog, 'Only admin or operator can add units to a activity.');
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
      void appendSystemEvent({ action: 'entries_entry_added', entity: 'entries', entity_id: newEntry.id, amount: newEntry.input_amount, details: 'Unit input recorded' });
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
      void appendSystemEvent({ action: 'entries_entry_added', entity: 'entries', amount: fullEntry.input_amount, details: 'Unit input recorded' });
      await fetchData();
    }
  };

  const updateEntry = async (entry: Entry) => {
    requirePermission(canManageValue, 'Only admin/operator can edit entries entries.');
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
      activity_count: fullEntry.activity_count ?? null,
      sort_order: fullEntry.sort_order ?? null,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { net: _entryNet, ...normalizedPersistedEntryForDb } = normalizedPersistedEntry;

    if (isDemoMode) {
      const updated = entries.map(l => l.id === entry.id ? fullEntry : l);
      setEntries(updated);
      localStorage.setItem('flow_ops_entries', JSON.stringify(updated));
      void appendSystemEvent({ action: 'entries_entry_updated', entity: 'entries', entity_id: entry.id, amount: net, details: 'Entries output/update applied' });
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

      void appendSystemEvent({ action: 'entries_entry_updated', entity: 'entries', entity_id: entry.id, amount: net, details: 'Entries output/update applied' });
      try {
        await fetchData();
      } catch {
        setEntries(previousEntries);
        throw new Error('Unable to refresh entries after update. Please retry.');
      }
    }
  };

  const deleteEntry = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can delete entries entries.');
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

    void appendSystemEvent({ action: 'entries_entry_deleted', entity: 'entries', entity_id: id, details: 'Entries entry removed' });
  };

  // --- Member & Operations Actions ---

  const addMember = async (memberData: Omit<Member, 'id' | 'created_at'>) => {
    const normalizedMember = sanitizeMemberInput(memberData);
    if (isDemoMode) {
      const newMember = { ...normalizedMember, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [...members, newMember];
      setMembers(updated);
      localStorage.setItem('flow_ops_members', JSON.stringify(updated));
      void appendSystemEvent({ action: 'member_added', entity: 'member', entity_id: newMember.id, details: newMember.name ?? 'Team member added' });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();
      const scopedMemberPayload = { ...normalizedMember, org_id: orgId };
      const { error } = await supabase.from('members').insert([scopedMemberPayload]);
      if (error) throw normalizeSupabaseWriteError(error);
      await fetchData();
      void appendSystemEvent({ action: 'member_added', entity: 'member', details: normalizedMember.name ?? 'Team member added' });
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
      void appendSystemEvent({ action: 'member_imported', entity: 'member', amount: newMembers.length, details: `${newMembers.length} team members imported` });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();
      const scopedBatch = normalizedBatch.map((item) => ({ ...item, org_id: orgId }));
      const { error } = await supabase.from('members').insert(scopedBatch);
      if (error) throw normalizeSupabaseWriteError(error);
      await fetchData();
      void appendSystemEvent({ action: 'member_imported', entity: 'member', amount: normalizedBatch.length, details: `${normalizedBatch.length} team members imported` });
    }
  };

  const updateMember = async (memberData: Member) => {
    const normalizedMember = sanitizeMemberRecord(memberData);
    if (isDemoMode) {
      const updated = members.map((member) => member.id === normalizedMember.id ? normalizedMember : member);
      setMembers(updated);
      localStorage.setItem('flow_ops_members', JSON.stringify(updated));
      void appendSystemEvent({ action: 'member_updated', entity: 'member', entity_id: normalizedMember.id, details: normalizedMember.name ?? 'Team member updated' });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('members').update(normalizedMember).eq('id', normalizedMember.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
      void appendSystemEvent({ action: 'member_updated', entity: 'member', entity_id: normalizedMember.id, details: normalizedMember.name ?? 'Team member updated' });
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
      void appendSystemEvent({ action: 'member_deleted', entity: 'member', entity_id: id, details: existingMember.name ?? 'Member deleted' });
      return;
    }

    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('members').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    void appendSystemEvent({ action: 'member_deleted', entity: 'member', entity_id: id, details: existingMember.name ?? 'Member deleted' });
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
      void appendSystemEvent({ action: 'log_started', entity: 'log', entity_id: newActivityLog.id, details: `Activity ${newActivityLog.workspace_id} · Member ${newActivityLog.member_id}` });
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
      void appendSystemEvent({ action: 'log_started', entity: 'log', details: `Activity ${sanitizedLogData.workspace_id} · Member ${sanitizedLogData.member_id}` });
    }
  };

  const updateActivityLog = async (logData: ActivityLog) => {
    const sanitizedLogData: ActivityLog = { ...logData };
    if (isDemoMode) {
      const updated = activityLogs.map(s => s.id === sanitizedLogData.id ? sanitizedLogData : s);
      setActivityLogs(updated);
      localStorage.setItem('flow_ops_activity_logs', JSON.stringify(updated));
      void appendSystemEvent({ action: 'log_updated', entity: 'log', entity_id: sanitizedLogData.id, details: `Activity ${sanitizedLogData.workspace_id} · Member ${sanitizedLogData.member_id}` });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('activity_logs').update(sanitizedLogData).eq('id', sanitizedLogData.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
      void appendSystemEvent({ action: 'log_updated', entity: 'log', entity_id: sanitizedLogData.id, details: `Activity ${sanitizedLogData.workspace_id} · Member ${sanitizedLogData.member_id}` });
    }
  };

  const endActivityLog = async (id: string, endTime: string, duration: number, pay?: number) => {
    requirePermission(canOperateLog, 'Only admin or operator can clock members out.');
    const log = activityLogs.find(s => s.id === id);
    if (!log) return;

    const updatedActivityLog = { ...log, end_time: endTime, duration_hours: duration, total_value: pay, status: 'completed' as const };
    await updateActivityLog(updatedActivityLog);
    void appendSystemEvent({ action: 'log_ended', entity: 'log', entity_id: id, amount: pay, details: `Activity ${log.workspace_id} · Duration ${duration.toFixed(2)}h` });
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'created_at'>) => {
    requirePermission(canManageValue, 'Only admin/operator can add expenses.');
    const sanitizedExpense = sanitizeExpenseInput(expenseData);
    if (isDemoMode) {
      const newExpense = { ...sanitizedExpense, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [newExpense, ...expenses];
      setExpenses(updated);
      localStorage.setItem('flow_ops_decrements', JSON.stringify(updated));
      void appendSystemEvent({ action: 'expense_added', entity: 'expense', entity_id: newExpense.id, amount: sanitizedExpense.amount, details: sanitizedExpense.category });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();
      const scopedExpensePayload = { ...sanitizedExpense, org_id: orgId };
      const { error } = await supabase.from('expenses').insert([scopedExpensePayload]);
      if (error) throw normalizeSupabaseWriteError(error);
      void appendSystemEvent({ action: 'expense_added', entity: 'expense', amount: sanitizedExpense.amount, details: sanitizedExpense.category });
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
      void appendSystemEvent({ action: 'expense_deleted', entity: 'expense', entity_id: id, amount: existingExpense?.amount, details: existingExpense?.category ?? 'Expense deleted' });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('expenses').delete().eq('id', id).eq('org_id', scopedOrgId);
      if (error) throw normalizeSupabaseWriteError(error);
      await fetchData();
      void appendSystemEvent({ action: 'expense_deleted', entity: 'expense', entity_id: id, amount: existingExpense?.amount, details: existingExpense?.category ?? 'Expense deleted' });
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
      void appendSystemEvent({ action: 'adjustment_recorded', entity: 'adjustment', entity_id: newAdjustment.id, amount: sanitizedAdjustment.amount, details: sanitizedAdjustment.type });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('adjustments').insert([{ ...sanitizedAdjustment, org_id: scopedOrgId }]);
      if (error) throw error;
      void appendSystemEvent({ action: 'adjustment_recorded', entity: 'adjustment', amount: sanitizedAdjustment.amount, details: sanitizedAdjustment.type });
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
      void appendSystemEvent({ action: 'adjustment_updated', entity: 'adjustment', entity_id: sanitizedAdjustment.id, amount: sanitizedAdjustment.amount, details: sanitizedAdjustment.type });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('adjustments').update(sanitizedAdjustment).eq('id', sanitizedAdjustment.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
      void appendSystemEvent({ action: 'adjustment_updated', entity: 'adjustment', entity_id: sanitizedAdjustment.id, amount: sanitizedAdjustment.amount, details: sanitizedAdjustment.type });
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
      void appendSystemEvent({ action: 'adjustment_deleted', entity: 'adjustment', entity_id: id, amount: existingAdjustment.amount, details: existingAdjustment.type });
      return;
    }

    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('adjustments').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    await fetchData();
    void appendSystemEvent({ action: 'adjustment_deleted', entity: 'adjustment', entity_id: id, amount: existingAdjustment.amount, details: existingAdjustment.type });
  };

  const addChannelEntry = async (entryData: Omit<ChannelEntry, 'id' | 'created_at'>) => {
    requirePermission(canAccessAdminUi, 'Only admin can add channel entries.');
    const sanitizedEntry = sanitizeChannelEntryInput(entryData);
    if (isDemoMode) {
      const newEntry = { ...sanitizedEntry, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [newEntry, ...channelEntries];
      setChannelEntries(updated);
      localStorage.setItem('flow_ops_channel_entries', JSON.stringify(updated));
      void appendSystemEvent({ action: 'channel_entry_added', entity: 'channel', entity_id: newEntry.id, amount: sanitizedEntry.amount, details: sanitizedEntry.type });
    } else {
      if (!supabase) return;
      const orgId = requireOrgScope();
      const scopedEntryPayload = { ...sanitizedEntry, org_id: orgId };
      const { error } = await supabase.from('channel_entries').insert([scopedEntryPayload]);
      if (error) throw normalizeSupabaseWriteError(error);
      void appendSystemEvent({ action: 'channel_entry_added', entity: 'channel', amount: sanitizedEntry.amount, details: sanitizedEntry.type });
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
      void appendSystemEvent({ action: 'channel_entry_deleted', entity: 'channel', entity_id: id, amount: existingEntry.amount, details: existingEntry.type });
      return;
    }

    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('channel_entries').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    await fetchData();
    void appendSystemEvent({ action: 'channel_entry_deleted', entity: 'channel', entity_id: id, amount: existingEntry.amount, details: existingEntry.type });
  };

  const addUnitAccountEntry = async (
    entry: Omit<UnitAccountEntry, 'id' | 'created_at'>,
  ): Promise<UnitAccountEntry> => {
    requirePermission(canManageValue, 'Only admin or operator can post unit adjustments or approved outputs.');

    const normalizedUnitId = requireNonEmpty(entry.unit_id, 'Unit');
    const normalizedType = entry.type;
    if (normalizedType === 'decrement' && !entry.request_id) {
      throw new Error('Outputs must be approved from a unit output request.');
    }
    if (normalizedType === 'decrement') {
      requirePermission(canAlign, 'Only admin can post approved unit outputs.');
    }
    const normalizedAmount = requirePositiveAmount(entry.amount, 'Entry amount');
    const normalizedDate = requireValidDate(entry.date, 'Entry date');
    const normalized: Omit<UnitAccountEntry, 'id' | 'created_at'> = {
      unit_id: normalizedUnitId,
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
      void appendSystemEvent({
        action: `unit_${normalizedType}_posted`,
        entity: 'unit',
        entity_id: normalizedUnitId,
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
        throw new Error('Unit output must be approved before it can be posted.');
      }

      if (requestCheck.data.unit_id !== normalizedUnitId) {
        throw new Error('Approved request does not match the selected unit.');
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
    await refreshDeferredDatasets();
    void appendSystemEvent({
      action: `unit_${normalizedType}_posted`,
      entity: 'unit',
      entity_id: normalizedUnitId,
      amount: normalizedAmount,
    });
    return insertRes.data as UnitAccountEntry;
  };

  const requestOutput = async (
    request: Omit<OutputRequest, 'id' | 'created_at' | 'status'>,
  ): Promise<OutputRequest> => {
    requirePermission(canManageValue, 'Only admin or operator can log output requests.');

    const normalizedUnitId = requireNonEmpty(request.unit_id, 'Unit');
    const normalizedAmount = requirePositiveAmount(request.amount, 'Output request amount');
    const normalizedRequestedAt = request.requested_at || new Date().toISOString();
    const normalized: Omit<OutputRequest, 'id' | 'created_at'> = {
      unit_id: normalizedUnitId,
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
      const updated = [created, ...outputRequests];
      setOutputRequests(updated);
      localStorage.setItem(OUTFLOW_REQUESTS_KEY, JSON.stringify(updated));
      void appendSystemEvent({
        action: 'unit_output_requested',
        entity: 'unit',
        entity_id: normalizedUnitId,
        amount: normalizedAmount,
      });
      return created;
    }

    if (!supabase) throw new Error('Supabase not initialized.');
    const orgId = requireOrgScope();
    const insertPayload = {
      ...normalized,
      org_id: orgId,
    };
    const insertRes = await supabase.from('output_requests').insert([insertPayload]).select('*').single();
    if (insertRes.error) throw normalizeSupabaseWriteError(insertRes.error);
    await refreshDeferredDatasets();
    void appendSystemEvent({
      action: 'unit_output_requested',
      entity: 'unit',
      entity_id: normalizedUnitId,
      amount: normalizedAmount,
    });
    return insertRes.data as OutputRequest;
  };

  const requestAdjustment = async (
    request: Omit<AdjustmentRequest, 'id' | 'created_at' | 'status'>,
  ): Promise<AdjustmentRequest> => {
    requirePermission(canManageValue, 'Only admin or operator can submit deferred entry requests.');

    const normalizedUnitId = requireNonEmpty(request.unit_id, 'Unit');
    const normalizedAmount = requirePositiveAmount(request.amount, 'Deferred entry amount');
    const normalizedRequestedAt = request.requested_at || new Date().toISOString();
    const normalizedType = request.type === 'output' ? 'output' : 'input';
    const normalized: Omit<AdjustmentRequest, 'id' | 'created_at'> = {
      unit_id: normalizedUnitId,
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
      const updated = [created, ...adjustmentRequests];
      setAdjustmentRequests(updated);
      localStorage.setItem(ADJUSTMENT_REQUESTS_KEY, JSON.stringify(updated));
      void appendSystemEvent({
        action: 'adjustment_requested',
        entity: 'adjustment',
        entity_id: normalizedUnitId,
        amount: normalizedAmount,
        details: normalizedType,
      });
      return created;
    }

    if (!supabase) throw new Error('Supabase not initialized.');
    const orgId = requireOrgScope();
    const insertPayload = {
      ...normalized,
      org_id: orgId,
    };
    const insertRes = await supabase.from('adjustment_requests').insert([insertPayload]).select('*').single();
    if (insertRes.error) throw normalizeSupabaseWriteError(insertRes.error);
    await refreshDeferredDatasets();
    void appendSystemEvent({
      action: 'adjustment_requested',
      entity: 'adjustment',
      entity_id: normalizedUnitId,
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

    if (!isDemoMode) {
      await refreshDeferredDatasets();
    }

    void appendSystemEvent({
      action: status === 'approved' ? 'adjustment_approved' : 'adjustment_rejected',
      entity: 'adjustment',
      entity_id: existing.unit_id,
      amount: existing.amount,
      details: existing.type,
    });
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
      await refreshDeferredDatasets();
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

    void appendSystemEvent({
      action: status === 'approved' ? 'unit_output_approved' : 'unit_output_rejected',
      entity: 'unit',
      entity_id: existing.unit_id,
      amount: existing.amount,
    });
  };

  const recordOutputRequest = async (unitId: string, amount: number, workspaceId?: string, method?: string, details?: string) => {
    const normalizedUnitId = requireNonEmpty(unitId, 'Unit');
    const normalizedAmount = requirePositiveAmount(amount, 'Output amount');

    await requestOutput({
      unit_id: normalizedUnitId,
      amount: normalizedAmount,
      workspace_id: workspaceId,
      method: method,
      details: details,
      requested_at: new Date().toISOString(),
    });
  };

  // ------------------------------------------------------------------
  // Transfer Account CRUD
  // ------------------------------------------------------------------

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

  const addPartner = async (partnerData: Omit<Partner, 'id' | 'created_at'>) => {
    const sanitizedPartner = sanitizePartnerInput(partnerData);
    if (isDemoMode) {
      const newPartner = { ...sanitizedPartner, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [...partners, newPartner];
      setPartners(updated);
      localStorage.setItem('flow_ops_partners', JSON.stringify(updated));
      void appendSystemEvent({ action: 'partner_added', entity: 'partner', entity_id: newPartner.id, details: newPartner.name });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('partners').insert([{ ...sanitizedPartner, org_id: scopedOrgId }]);
      if (error) throw error;
      await fetchData();
      void appendSystemEvent({ action: 'partner_added', entity: 'partner', details: sanitizedPartner.name });
    }
  };

  const updatePartner = async (partnerData: Partner) => {
    const sanitizedPartner = sanitizePartnerRecord(partnerData);
    if (isDemoMode) {
      const updated = partners.map(a => a.id === sanitizedPartner.id ? sanitizedPartner : a);
      setPartners(updated);
      localStorage.setItem('flow_ops_partners', JSON.stringify(updated));
      void appendSystemEvent({ action: 'partner_updated', entity: 'partner', entity_id: sanitizedPartner.id, details: sanitizedPartner.name });
    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const { error } = await supabase.from('partners').update(sanitizedPartner).eq('id', sanitizedPartner.id).eq('org_id', scopedOrgId);
      if (error) throw error;
      await fetchData();
      void appendSystemEvent({ action: 'partner_updated', entity: 'partner', entity_id: sanitizedPartner.id, details: sanitizedPartner.name });
    }
  };

  const deletePartner = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can remove partners.');
    const existingPartner = partners.find(item => item.id === id);
    if (!existingPartner) return;

    const hasEntrys = partnerEntries.some(entry => entry.partner_id === id);
    if (hasEntrys) {
      throw new Error('Cannot remove entity with entry history. Remove related entries first.');
    }

    const hasReferredUnits = units.some(unit => unit.referred_by_partner_id === id);
    if (hasReferredUnits) {
      throw new Error('Cannot remove entity while units are still linked. Reassign or clear unit entity links first.');
    }

    if (isDemoMode) {
      const updated = partners.filter(item => item.id !== id);
      setPartners(updated);
      localStorage.setItem('flow_ops_partners', JSON.stringify(updated));
      void appendSystemEvent({ action: 'partner_deleted', entity: 'partner', entity_id: id, details: existingPartner.name });
      return;
    }

    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error } = await supabase.from('partners').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (error) throw normalizeSupabaseWriteError(error);
    await fetchData();
    void appendSystemEvent({ action: 'partner_deleted', entity: 'partner', entity_id: id, details: existingPartner.name });
  };

  const addPartnerEntry = async (entryData: Omit<PartnerEntry, 'id' | 'created_at'>) => {
    requirePermission(canManageValue, 'Only admin/operator can add partner entries.');
    const sanitizedEntry = sanitizePartnerEntryInput(entryData);
    if (isDemoMode) {
      const newEntry = { ...sanitizedEntry, id: uuidv4(), created_at: new Date().toISOString() };
      const updated = [newEntry, ...partnerEntries];
      setPartnerEntries(updated);
      localStorage.setItem('flow_ops_partner_trans', JSON.stringify(updated));
      void appendSystemEvent({ action: 'partner_entry_added', entity: 'partner_entry', entity_id: newEntry.id, amount: sanitizedEntry.amount, details: sanitizedEntry.type });

      // Update Partner Total automatically
      const partner = partners.find(a => a.id === sanitizedEntry.partner_id);
      if (partner) {
        let totalChange = 0;
        // Input increases entity total; other entry types reduce it.
        if (sanitizedEntry.type === 'input') totalChange = sanitizedEntry.amount;
        else totalChange = -sanitizedEntry.amount;

        const updatedPartner = { ...partner, total: partner.total + totalChange };
        await updatePartner(updatedPartner);
      }

    } else {
      if (!supabase) return;
      const scopedOrgId = requireOrgScope();
      const rpcResult = await supabase.rpc('partner_record_entry', {
        p_partner_id: sanitizedEntry.partner_id,
        p_type: sanitizedEntry.type,
        p_amount: sanitizedEntry.amount,
        p_date: sanitizedEntry.date,
        p_org_id: scopedOrgId,
      });

      if (!rpcResult.error) {
        void appendSystemEvent({ action: 'partner_entry_added', entity: 'partner_entry', amount: sanitizedEntry.amount, details: sanitizedEntry.type });
        await fetchData();
        return;
      }

      if (!isMissingFunctionError(rpcResult.error, 'partner_record_entry')) {
        throw rpcResult.error;
      }

      const createdEntryRes = await supabase
        .from('partner_entries')
        .insert([{
          ...sanitizedEntry,
          org_id: scopedOrgId,
        }])
        .select('id')
        .single();
      if (createdEntryRes.error) throw createdEntryRes.error;
      void appendSystemEvent({ action: 'partner_entry_added', entity: 'partner_entry', entity_id: createdEntryRes.data?.id, amount: sanitizedEntry.amount, details: sanitizedEntry.type });
      
      // Trigger total update via Supabase trigger or manual update here? 
      // For now, manual update to keep logic consistent
      const partner = partners.find(a => a.id === sanitizedEntry.partner_id);
      if (partner) {
        let totalChange = 0;
        if (sanitizedEntry.type === 'input') totalChange = sanitizedEntry.amount;
        else totalChange = -sanitizedEntry.amount;
        
        const { error: totalUpdateError } = await supabase
          .from('partners')
          .update({ total: partner.total + totalChange })
          .eq('id', partner.id)
          .eq('org_id', scopedOrgId);
        if (totalUpdateError) {
          if (createdEntryRes.data?.id) {
            await supabase.from('partner_entries').delete().eq('id', createdEntryRes.data.id).eq('org_id', scopedOrgId);
          }
          throw totalUpdateError;
        }
      }

      await fetchData();
    }
  };

  const deletePartnerEntry = async (id: string) => {
    requirePermission(canManageValue, 'Only admin/operator can remove partner entries.');
    const existingEntry = partnerEntries.find(item => item.id === id);
    if (!existingEntry) return;

    const relatedPartner = partners.find(item => item.id === existingEntry.partner_id);
    const reverseTotalChange = existingEntry.type === 'input'
      ? -existingEntry.amount
      : existingEntry.amount;

    if (isDemoMode) {
      const updatedEntrys = partnerEntries.filter(item => item.id !== id);
      setPartnerEntries(updatedEntrys);
      localStorage.setItem('flow_ops_partner_trans', JSON.stringify(updatedEntrys));

      if (relatedPartner) {
        const updatedPartners = partners.map(item => (
          item.id === relatedPartner.id
            ? { ...item, total: item.total + reverseTotalChange }
            : item
        ));
        setPartners(updatedPartners);
        localStorage.setItem('flow_ops_partners', JSON.stringify(updatedPartners));
      }

      void appendSystemEvent({ action: 'partner_entry_deleted', entity: 'partner_entry', entity_id: id, amount: existingEntry.amount, details: existingEntry.type });
      return;
    }

    if (!supabase) return;
    const scopedOrgId = requireOrgScope();
    const { error: deleteError } = await supabase.from('partner_entries').delete().eq('id', id).eq('org_id', scopedOrgId);
    if (deleteError) throw normalizeSupabaseWriteError(deleteError);

    if (relatedPartner) {
      const { error: totalUpdateError } = await supabase
        .from('partners')
        .update({ total: relatedPartner.total + reverseTotalChange })
        .eq('id', relatedPartner.id)
        .eq('org_id', scopedOrgId);

      if (totalUpdateError) {
        await supabase.from('partner_entries').insert([{
          ...existingEntry,
          org_id: scopedOrgId,
        }]);
    throw normalizeSupabaseWriteError(totalUpdateError);
      }
    }

    await fetchData();
    void appendSystemEvent({ action: 'partner_entry_deleted', entity: 'partner_entry', entity_id: id, amount: existingEntry.amount, details: existingEntry.type });
  };

  const fetchAvailableOrgs = async () => {
    if (role !== 'admin' || isDemoMode || !supabase) return;
    try {
      const accessToken = await getFreshAccessToken();
      if (!accessToken) return;

      const { data, error } = await supabase.functions.invoke('manage-meta-org-admins', {
        body: {
          action: 'list-org-contexts',
          access_token: accessToken,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
        }
      });

      if (!error && data?.managed_org_ids) {
        setManagedOrgIds(data.managed_org_ids);
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
    
    const accessToken = await getFreshAccessToken();
    if (!accessToken) throw new Error('Authentication session expired.');

    const { data, error: functionError } = await supabase.functions.invoke('manage-meta-org-admins', {
      body: {
        action: 'switch-org-context',
        org_id: orgId,
        access_token: accessToken,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      }
    });

    if (functionError) throw new Error(functionError.message || 'Failed to switch organization cluster.');
    
    // Clear the profiles cache to trigger reload
    profilesUnavailableRef.current = false;
    await fetchData();
  };

  const provisionProfileOrgContext = async () => {
    if (!canAccessAdminUi) throw new Error('Only admin accounts can provision workspace clusters.');
    if (!user) throw new Error('You must be signed in to provision organization context.');

    if (isDemoMode) {
      setActiveOrgId(crypto.randomUUID());
      return;
    }

    if (!supabase) return;

    const accessToken = await getFreshAccessToken();
    if (!accessToken) throw new Error('Authentication session expired.');

    const { data, error: functionError } = await supabase.functions.invoke('manage-meta-org-admins', {
      body: {
        action: 'provision-org-context',
        access_token: accessToken,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      }
    });

    if (functionError) throw new Error(functionError.message || 'Failed to provision fresh workspace cluster.');

    if (data?.managed_org_ids) {
      setManagedOrgIds(data.managed_org_ids);
    }

    profilesUnavailableRef.current = false;
    await fetchData();
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
      channelEntries: channelEntries,
      unitAccountEntries,
      outputRequests,
      transferAccounts,
      partners,
      partnerEntries,
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
      addChannelEntry: addChannelEntry,
      deleteChannelEntry: deleteChannelEntry,
      transferChannelValues: transferChannelValues,
      addTransferAccount,
      updateTransferAccount,
      deleteTransferAccount,
      addPartner,
      updatePartner,
      deletePartner,
      addPartnerEntry,
      deletePartnerEntry,
      updateProfileOrgId,
      provisionProfileOrgContext,
      managedOrgIds,
      recordSystemEvent: appendSystemEvent,
      refreshData: fetchData
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
