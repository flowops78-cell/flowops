import { createClient } from '@supabase/supabase-js';
import { normalizeAppRole, type AppRole } from './roles';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_ANON_KEY = supabaseAnonKey;

export const AUTH_PERSIST_ACTIVITY_KEY = 'flow_ops_auth_persist_activity';

export const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== "https://your-project.supabase.co" && 
  supabaseAnonKey !== "your-anon-key";

const authStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(key, value);
    localStorage.removeItem(key);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type UserAuthorityContext = {
  source: 'memberships' | 'legacy' | 'none';
  role: AppRole | null;
  activeOrgId: string | null;
  managedOrgIds: string[];
  clusterId: string | null;
  isPlatformAdmin: boolean;
};

type MembershipAuthorityRow = {
  org_id: string;
  role: AppRole;
  status: 'active' | 'invited' | 'disabled';
  is_default_org: boolean;
};

const roleRank: Record<AppRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

const pickStrongestRole = (roles: Array<AppRole | null | undefined>): AppRole | null => {
  let strongest: AppRole | null = null;
  for (const role of roles) {
    if (!role) continue;
    if (!strongest || roleRank[role] > roleRank[strongest]) {
      strongest = role;
    }
  }
  return strongest;
};

const dedupeStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

export async function getUserAuthorityContext(userId: string): Promise<UserAuthorityContext> {
  if (!supabase || !userId) {
    return {
      source: 'none',
      role: null,
      activeOrgId: null,
      managedOrgIds: [],
      clusterId: null,
      isPlatformAdmin: false,
    };
  }

  // 1. Fetch memberships and profile context
  const [{ data: orgMemberships, error: orgError }, { data: clusterMemberships, error: clusterError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from('organization_memberships')
      .select('org_id, role, status, is_default_org')
      .eq('user_id', userId)
      .in('status', ['active', 'invited']),
    supabase
      .from('cluster_memberships')
      .select('cluster_id, role')
      .eq('user_id', userId),
    supabase
      .from('profiles')
      .select('active_org_id, active_cluster_id')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (orgError) console.error('Error fetching org memberships:', orgError);
  if (clusterError) console.error('Error fetching cluster memberships:', clusterError);
  if (profileError) console.error('Error fetching profile:', profileError);

  const typedOrgMemberships = (orgMemberships ?? []) as MembershipAuthorityRow[];
  const typedClusterMemberships = (clusterMemberships ?? []) as Array<{ cluster_id: string; role: string }>;

  const isClusterAdmin = typedClusterMemberships.some(m => m.role === 'cluster_admin');
  
  if (typedOrgMemberships.length > 0 || typedClusterMemberships.length > 0) {
    const activeOrgId = profile?.active_org_id ?? typedOrgMemberships.find(m => m.is_default_org)?.org_id ?? typedOrgMemberships[0]?.org_id ?? null;
    let clusterId = profile?.active_cluster_id;

    if (!clusterId && activeOrgId) {
      // Internal optimization: if we have org memberships, we might find the cluster_id from joined data if we select it
      // But for simplicity here, we rely on the membership tables as source of truth.
    }

    const directMembership = typedOrgMemberships.find(m => m.org_id === activeOrgId);
    let resolvedRole: AppRole | null = directMembership?.role ?? null;

    if (!resolvedRole && clusterId) {
      const clusterMember = typedClusterMemberships.find(cm => cm.cluster_id === clusterId);
      if (clusterMember) {
        if (clusterMember.role === 'cluster_admin') resolvedRole = 'admin';
        else if (clusterMember.role === 'cluster_operator') resolvedRole = 'operator';
        else resolvedRole = 'viewer';
      }
    }

    return {
      source: 'memberships',
      role: resolvedRole || 'viewer',
      activeOrgId,
      managedOrgIds: dedupeStrings(typedOrgMemberships.map(m => m.org_id)),
      clusterId: clusterId || typedClusterMemberships[0]?.cluster_id || null,
      isPlatformAdmin: isClusterAdmin,
    };
  }

  return {
    source: 'none',
    role: null,
    activeOrgId: null,
    managedOrgIds: [],
    clusterId: null,
    isPlatformAdmin: false,
  };

  return {
    source: 'none',
    role: null,
    activeOrgId: null,
    managedOrgIds: [],
    clusterId: null,
    isPlatformAdmin: false,
  };
}

export async function getSupabaseAccessToken() {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session?.access_token) return null;

  const { data: authUserData, error: authUserError } = await supabase.auth.getUser(session.access_token);
  if (!authUserError && authUserData.user) {
    return session.access_token;
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  const refreshedSession = refreshData.session;
  if (refreshError || !refreshedSession?.access_token) {
    return null;
  }

  const { data: refreshedUserData, error: refreshedUserError } = await supabase.auth.getUser(refreshedSession.access_token);
  if (refreshedUserError || !refreshedUserData.user) {
    return null;
  }

  return refreshedSession.access_token;
}

export function getSupabase() {
  if (!supabase) throw new Error('Supabase project connectivity is not configured in environment variables.');
  return supabase;
}
