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
  metaOrgId: string | null;
};

type MembershipAuthorityRow = {
  org_id: string;
  role: AppRole;
  status: 'active' | 'invited' | 'disabled';
  is_default_org: boolean;
  created_at: string;
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
      metaOrgId: null,
    };
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from('org_memberships')
    .select('org_id, role, status, is_default_org, created_at')
    .eq('user_id', userId)
    .in('status', ['active', 'invited'])
    .order('is_default_org', { ascending: false })
    .order('created_at', { ascending: true });

  if (!membershipError && membershipRows && membershipRows.length > 0) {
    const memberships = (membershipRows as MembershipAuthorityRow[])
      .filter((row) => !!row.org_id)
      .map((row) => ({
        ...row,
        role: normalizeAppRole(row.role) ?? 'viewer',
      }));

    if (memberships.length > 0) {
      const defaultMembership = memberships.find((row) => row.is_default_org) ?? memberships[0];

      // Resolve metaOrgId from the user's profile (memberships don't carry it directly)
      const { data: profileForMeta } = await supabase
        .from('profiles')
        .select('meta_org_id')
        .eq('id', userId)
        .maybeSingle();

      return {
        source: 'memberships',
        role: pickStrongestRole(memberships.map((row) => row.role)),
        activeOrgId: defaultMembership?.org_id ?? null,
        managedOrgIds: dedupeStrings(memberships.map((row) => row.org_id)),
        metaOrgId: profileForMeta?.meta_org_id ?? null,
      };
    }
  }

  const [{ data: profileData }, { data: userRoleData }] = await Promise.all([
    supabase
      .from('profiles')
      .select('org_id, meta_org_id')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const legacyRole = normalizeAppRole(userRoleData?.role);
  const legacyOrgId = profileData?.org_id ?? null;
  const metaOrgId = profileData?.meta_org_id ?? null;

  if (legacyRole || legacyOrgId || metaOrgId) {
    return {
      source: 'legacy',
      role: legacyRole,
      activeOrgId: legacyOrgId,
      managedOrgIds: legacyOrgId ? [legacyOrgId] : [],
      metaOrgId,
    };
  }

  return {
    source: 'none',
    role: null,
    activeOrgId: null,
    managedOrgIds: [],
    metaOrgId: null,
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
