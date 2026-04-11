import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getUserAuthorityContext, isSupabaseConfigured, supabase, type ClusterMeta, type OrgMeta } from '../lib/supabase';
import { AppRole, normalizeAppRole } from '../lib/roles';
import { useAuth } from './AuthContext';

type AppRoleContextType = {
  role: AppRole;
  setRole: (role: AppRole) => void;
  loading: boolean;
  roleLocked: boolean;
  canAccessAdminUi: boolean;
  canOperateLog: boolean;
  canManageImpact: boolean;
  canAlign: boolean;
  clusterRole: 'cluster_admin' | 'cluster_operator' | 'viewer' | null;
  isClusterAdmin: boolean;
  clusterId: string | null;
  managedOrgIds: string[];
  serverActiveOrgId: string | null;
  refreshAuthority: () => Promise<void>;
  manageableClusters: ClusterMeta[];
  manageableOrgsByCluster: Record<string, OrgMeta[]>;
};


const APP_ROLE_STORAGE_KEY = 'flow_ops_role';

const roleRank: Record<AppRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

const pickStrongestRole = (...roles: Array<AppRole | null | undefined>): AppRole | null => {
  let strongest: AppRole | null = null;

  roles.forEach((candidate) => {
    if (!candidate) return;
    if (!strongest || roleRank[candidate] > roleRank[strongest]) {
      strongest = candidate;
    }
  });

  return strongest;
};

const AppRoleContext = createContext<AppRoleContextType | undefined>(undefined);

export const AppRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const userIdRef = useRef<string | undefined>(user?.id);
  userIdRef.current = user?.id;
  const [role, setRoleState] = useState<AppRole>('viewer');
  const [profileRole, setProfileRole] = useState<AppRole | null>(null);
  const [clusterRoleState, setClusterRoleState] = useState<'cluster_admin' | 'cluster_operator' | 'viewer' | null>(null);
  const [isClusterAdminState, setIsClusterAdminState] = useState(false);
  const [clusterIdState, setClusterIdState] = useState<string | null>(null);
  const [managedOrgIdsState, setManagedOrgIdsState] = useState<string[]>([]);
  const [serverActiveOrgIdState, setServerActiveOrgIdState] = useState<string | null>(null);
  const [manageableClustersState, setManageableClustersState] = useState<ClusterMeta[]>([]);
  const [manageableOrgsByClusterState, setManageableOrgsByClusterState] = useState<Record<string, OrgMeta[]>>({});
  const [profileRoleLoading, setProfileRoleLoading] = useState(false);

  const roleFromMetadata = user?.user_metadata?.app_role;
  const metadataRole = normalizeAppRole(roleFromMetadata);
  const effectiveServerRole = pickStrongestRole(
    metadataRole,
    profileRole,
    isClusterAdminState ? 'admin' : null,
  );
  const roleLocked = Boolean(isSupabaseConfigured && user);
  const loading = Boolean(
    authLoading || (isSupabaseConfigured && !!user && !metadataRole && profileRoleLoading),
  );

  const resetAuthorityState = useCallback(() => {
    setProfileRole(null);
    setClusterRoleState(null);
    setIsClusterAdminState(false);
    setClusterIdState(null);
    setManagedOrgIdsState([]);
    setServerActiveOrgIdState(null);
    setManageableClustersState([]);
    setManageableOrgsByClusterState({});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProfileRole = async () => {
      if (!isSupabaseConfigured || !supabase || !user?.id) {
        resetAuthorityState();
        setProfileRoleLoading(false);
        return;
      }

      // Always query DB for cluster/workspace scope (manageableClusters, etc.)

      setProfileRoleLoading(true);

      const authority = await getUserAuthorityContext(user.id);

      if (cancelled) return;
      if (authority.source === 'none') {
        resetAuthorityState();
        setProfileRoleLoading(false);
        return;
      }

      const roleFromProfile = normalizeAppRole(authority.role);
      setProfileRole(roleFromProfile);
      setClusterRoleState(authority.clusterRole);
      setIsClusterAdminState(authority.clusterRole === 'cluster_admin');
      setClusterIdState(authority.clusterId);
      setManagedOrgIdsState(authority.managedOrgIds);
      setServerActiveOrgIdState(authority.activeOrgId);
      setManageableClustersState(authority.manageableClusters);
      setManageableOrgsByClusterState(authority.manageableOrgsByCluster);
      setProfileRoleLoading(false);

    };

    void loadProfileRole();
    return () => {
      cancelled = true;
    };
  }, [metadataRole, resetAuthorityState, user?.id]);

  const refreshAuthority = useCallback(async () => {
    if (!supabase || !user?.id) return;
    const capturedUserId = user.id;
    const authority = await getUserAuthorityContext(capturedUserId);
    // If the user changed (e.g. logged out) while the fetch was in flight, discard.
    if (capturedUserId !== userIdRef.current) return;
    if (authority.source === 'none') {
      resetAuthorityState();
      return;
    }
    setClusterRoleState(authority.clusterRole);
    setIsClusterAdminState(authority.clusterRole === 'cluster_admin');
    setClusterIdState(authority.clusterId);
    setManagedOrgIdsState(authority.managedOrgIds);
    setServerActiveOrgIdState(authority.activeOrgId);
    setManageableClustersState(authority.manageableClusters);
    setManageableOrgsByClusterState(authority.manageableOrgsByCluster);
    const roleFromProfile = normalizeAppRole(authority.role);
    setProfileRole(roleFromProfile);
  }, [user?.id, resetAuthorityState]);

  useEffect(() => {
    if (effectiveServerRole) {
      setRoleState(effectiveServerRole);
    } else {
      setRoleState('viewer');
    }
  }, [effectiveServerRole]);

  const setRole = (nextRole: AppRole) => {
    // No-op in production. Client-side mutations are strictly forbidden.
    console.warn('Local role mutation stripped for security. Role driven purely by server.');
  };

  const value = useMemo<AppRoleContextType>(() => {
    const canAccessAdminUi = role === 'admin';
    const canOperateLog = role === 'admin' || role === 'operator';
    const canManageImpact = role === 'admin' || role === 'operator';
    const canAlign = role === 'admin';
    return {
      role,
      setRole,
      loading,
      roleLocked,
      canAccessAdminUi,
      canOperateLog,
      canManageImpact,
      canAlign,
      clusterRole: clusterRoleState,
      isClusterAdmin: isClusterAdminState,
      clusterId: clusterIdState,
      managedOrgIds: managedOrgIdsState,
      serverActiveOrgId: serverActiveOrgIdState,
      refreshAuthority,
      manageableClusters: manageableClustersState,
      manageableOrgsByCluster: manageableOrgsByClusterState,
    };
  }, [loading, role, roleLocked, clusterRoleState, isClusterAdminState, clusterIdState, managedOrgIdsState, serverActiveOrgIdState, manageableClustersState, manageableOrgsByClusterState, refreshAuthority]);


  return <AppRoleContext.Provider value={value}>{children}</AppRoleContext.Provider>;
};

export const useAppRole = () => {
  const ctx = useContext(AppRoleContext);
  if (!ctx) throw new Error('useAppRole must be used within AppRoleProvider');
  return ctx;
};
