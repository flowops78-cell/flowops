import { createClient } from '@supabase/supabase-js';
import { normalizeAppRole, type AppRole } from './roles';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const SUPABASE_ANON_KEY = supabasePublishableKey;

export const AUTH_PERSIST_ACTIVITY_KEY = 'flow_ops_auth_persist_activity';

export const isSupabaseConfigured = 
  supabaseUrl && 
  supabasePublishableKey && 
  supabaseUrl !== "https://your-project.supabase.co" && 
  supabasePublishableKey !== "your-anon-key";

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
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type ClusterMeta = {
  id: string;
  name: string | null;
  tag: string | null;
  slug: string | null;
};

export type OrgMeta = {
  id: string;
  name: string | null;
  tag: string | null;
  slug: string | null;
  cluster_id: string | null;
};

export type UserAuthorityContext = {
  source: 'teamMemberships' | 'legacy' | 'none';
  role: AppRole | null;
  activeOrgId: string | null;
  managedOrgIds: string[];
  clusterId: string | null;
  clusterRole: 'cluster_admin' | 'cluster_operator' | 'viewer' | null;
  isPlatformAdmin: boolean;
  manageableClusters: ClusterMeta[];
  manageableOrgsByCluster: Record<string, OrgMeta[]>;
};


type TeamMembershipAuthorityRow = {
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
      clusterRole: null,
      isPlatformAdmin: false,
      manageableClusters: [],
      manageableOrgsByCluster: {},
    };
  }


  // 1. Fetch memberships, platform role, and profile context
  const [
    { data: orgMemberships, error: orgError },
    { data: clusterMemberships, error: clusterError },
    { data: platformRoles, error: platError },
    { data: profile, error: profileError }
  ] = await Promise.all([
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
      .from('platform_roles')
      .select('role')
      .eq('user_id', userId),
    supabase
      .from('profiles')
      .select('active_org_id, active_cluster_id')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  if (orgError) console.error('Error fetching org memberships:', orgError);
  if (clusterError) console.error('Error fetching cluster memberships:', clusterError);
  if (platError) console.error('Error fetching platform roles:', platError);
  if (profileError) console.error('Error fetching profile:', profileError);

  const typedOrgTeamMemberships = (orgMemberships ?? []) as TeamMembershipAuthorityRow[];
  const typedClusterTeamMemberships = (clusterMemberships ?? []) as Array<{ cluster_id: string; role: string }>;
  const isPlatformAdmin = (platformRoles ?? []).some(r => r.role === 'platform_admin');
  const isClusterAdmin = isPlatformAdmin || typedClusterTeamMemberships.some(m => m.role === 'cluster_admin');
  
  if (typedOrgTeamMemberships.length > 0 || typedClusterTeamMemberships.length > 0 || isPlatformAdmin) {
    const activeOrgId = profile?.active_org_id ?? typedOrgTeamMemberships.find(m => m.is_default_org)?.org_id ?? typedOrgTeamMemberships[0]?.org_id ?? null;
    let clusterId = profile?.active_cluster_id || typedClusterTeamMemberships[0]?.cluster_id || null;

    // If cluster admin, fetch ALL clusters they admin + orgs grouped by cluster
    let allClusterOrgIds: string[] = [];
    let manageableClusters: ClusterMeta[] = [];
    let manageableOrgsByCluster: Record<string, OrgMeta[]> = {};
    if (isClusterAdmin) {
      if (isPlatformAdmin) {
        // Platform admins see EVERYTHING
        const { data: clusterRows } = await supabase.from('clusters').select('id, name, tag, slug');
        const { data: clusterOrgs } = await supabase.from('organizations').select('id, name, tag, slug, cluster_id');
        
        if (clusterRows) manageableClusters = clusterRows as ClusterMeta[];
        if (clusterOrgs) {
          allClusterOrgIds = (clusterOrgs as OrgMeta[]).map(o => o.id);
          for (const org of clusterOrgs as OrgMeta[]) {
            const key = org.cluster_id ?? 'unknown';
            if (!manageableOrgsByCluster[key]) manageableOrgsByCluster[key] = [];
            manageableOrgsByCluster[key].push(org);
          }
        }
      } else {
        const adminClusterIds = typedClusterTeamMemberships
          .filter(m => m.role === 'cluster_admin')
          .map(m => m.cluster_id);
        if (adminClusterIds.length > 0) {
          // Fetch cluster metadata
          const { data: clusterRows } = await supabase
            .from('clusters')
            .select('id, name, tag, slug')
            .in('id', adminClusterIds);
          if (clusterRows) {
            manageableClusters = clusterRows as ClusterMeta[];
          }
          // Fetch all orgs across those clusters
          const { data: clusterOrgs } = await supabase
            .from('organizations')
            .select('id, name, tag, slug, cluster_id')
            .in('cluster_id', adminClusterIds);
          if (clusterOrgs) {
            allClusterOrgIds = (clusterOrgs as OrgMeta[]).map(o => o.id);
            // Group by cluster
            for (const org of clusterOrgs as OrgMeta[]) {
              const key = org.cluster_id ?? 'unknown';
              if (!manageableOrgsByCluster[key]) manageableOrgsByCluster[key] = [];
              manageableOrgsByCluster[key].push(org);
            }
          }
        }
      }
    }

    const directTeamMembership = typedOrgTeamMemberships.find(m => m.org_id === activeOrgId);
    let resolvedRole: AppRole | null = directTeamMembership?.role ?? null;

    if (!resolvedRole && clusterId) {
      const clusterTeamMember = typedClusterTeamMemberships.find(cm => cm.cluster_id === clusterId);
      if (clusterTeamMember) {
        if (clusterTeamMember.role === 'cluster_admin') resolvedRole = 'admin';
        else if (clusterTeamMember.role === 'cluster_operator') resolvedRole = 'operator';
        else resolvedRole = 'viewer';
      }
    }

    return {
      source: 'teamMemberships',
      role: isPlatformAdmin ? 'admin' : (resolvedRole || 'viewer'),
      activeOrgId,
      managedOrgIds: dedupeStrings([...typedOrgTeamMemberships.map(m => m.org_id), ...allClusterOrgIds]),
      clusterId,
      clusterRole: (typedClusterTeamMemberships.find(m => m.cluster_id === clusterId)?.role as any) || null,
      isPlatformAdmin,
      manageableClusters,
      manageableOrgsByCluster,
    };
  }

  return {
    source: 'none',
    role: null,
    activeOrgId: null,
    managedOrgIds: [],
    clusterId: null,
    clusterRole: null,
    isPlatformAdmin: false,
    manageableClusters: [],
    manageableOrgsByCluster: {},
  };
}

let tokenPromise: Promise<string | null> | null = null;

export async function getSupabaseAccessToken() {
  if (!supabase) return null;
  
  if (tokenPromise) return tokenPromise;

  tokenPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      const session = data.session;
      
      if (!error && session?.access_token) {
        // Validate token with getUser to ensure it's not just a stale local token
        const { data: authUserData, error: authUserError } = await supabase.auth.getUser(session.access_token);
        if (!authUserError && authUserData.user) {
          return session.access_token;
        }
      }

      // If session is missing or token invalid, try to refresh
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
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

export function getSupabase() {
  if (!supabase) throw new Error('Supabase project connectivity is not configured in environment variables.');
  return supabase;
}
