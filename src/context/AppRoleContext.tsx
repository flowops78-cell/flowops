import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getUserAuthorityContext, isSupabaseConfigured, supabase, type ClusterMeta, type OrgMeta } from '../lib/supabase';
import { AppRole, normalizeAppRole } from '../lib/roles';
import { useAuth } from './AuthContext';

export type { AppRole } from '../lib/roles';

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
  isPlatformAdmin: boolean;
  clusterId: string | null;
  managedOrgIds: string[];
  refreshAuthority: () => Promise<void>;
  manageableClusters: ClusterMeta[];
  manageableOrgsByCluster: Record<string, OrgMeta[]>;
};


const APP_ROLE_STORAGE_KEY = 'flow_ops_role';

const AppRoleContext = createContext<AppRoleContextType | undefined>(undefined);

export const AppRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [role, setRoleState] = useState<AppRole>('viewer');
  const [profileRole, setProfileRole] = useState<AppRole | null>(null);
  const [clusterRoleState, setClusterRoleState] = useState<'cluster_admin' | 'cluster_operator' | 'viewer' | null>(null);
  const [isClusterAdminState, setIsClusterAdminState] = useState(false);
  const [isPlatformAdminState, setIsPlatformAdminState] = useState(false);
  const [clusterIdState, setClusterIdState] = useState<string | null>(null);
  const [managedOrgIdsState, setManagedOrgIdsState] = useState<string[]>([]);
  const [manageableClustersState, setManageableClustersState] = useState<ClusterMeta[]>([]);
  const [manageableOrgsByClusterState, setManageableOrgsByClusterState] = useState<Record<string, OrgMeta[]>>({});
  const [profileRoleLoading, setProfileRoleLoading] = useState(false);

  const roleFromMetadata = user?.user_metadata?.app_role;
  const metadataRole = normalizeAppRole(roleFromMetadata);
  const effectiveServerRole = metadataRole ?? profileRole;
  const roleLocked = isSupabaseConfigured && !!user;
  const loading = authLoading || (isSupabaseConfigured && !!user && !metadataRole && profileRoleLoading);

  useEffect(() => {
    let cancelled = false;

    const loadProfileRole = async () => {
      if (!isSupabaseConfigured || !supabase || !user?.id) {
        setProfileRole(null);
        setProfileRoleLoading(false);
        return;
      }

      // Removed early return: We must always query the database to hydrate 
      // administrative context (isPlatformAdmin, manageableClusters) even if 
      // metadataRole provides the basic AppRole string.

      setProfileRoleLoading(true);

      const authority = await getUserAuthorityContext(user.id);

      if (cancelled) return;
      if (authority.source === 'none') {
        setProfileRole(null);
        setProfileRoleLoading(false);
        return;
      }

      const roleFromProfile = normalizeAppRole(authority.role);
      setProfileRole(roleFromProfile);
      setClusterRoleState(authority.clusterRole);
      setIsPlatformAdminState(authority.isPlatformAdmin);
      setIsClusterAdminState(authority.isPlatformAdmin || authority.clusterRole === 'cluster_admin');
      setClusterIdState(authority.clusterId);
      setManagedOrgIdsState(authority.managedOrgIds);
      setManageableClustersState(authority.manageableClusters);
      setManageableOrgsByClusterState(authority.manageableOrgsByCluster);
      setProfileRoleLoading(false);

    };

    void loadProfileRole();
    return () => {
      cancelled = true;
    };
  }, [metadataRole, user?.id]);

  const refreshAuthority = async () => {
    if (!supabase || !user?.id) return;
    const authority = await getUserAuthorityContext(user.id);
    if (authority.source === 'none') return;
    setClusterRoleState(authority.clusterRole);
    setIsPlatformAdminState(authority.isPlatformAdmin);
    setIsClusterAdminState(authority.isPlatformAdmin || authority.clusterRole === 'cluster_admin');
    setClusterIdState(authority.clusterId);
    setManagedOrgIdsState(authority.managedOrgIds);
    setManageableClustersState(authority.manageableClusters);
    setManageableOrgsByClusterState(authority.manageableOrgsByCluster);
    const roleFromProfile = normalizeAppRole(authority.role);
    setProfileRole(roleFromProfile);
  };

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
       isPlatformAdmin: isPlatformAdminState,
       clusterId: clusterIdState,
       managedOrgIds: managedOrgIdsState,
       refreshAuthority,
       manageableClusters: manageableClustersState,
       manageableOrgsByCluster: manageableOrgsByClusterState,
     };
   }, [loading, role, roleLocked, clusterRoleState, isClusterAdminState, clusterIdState, managedOrgIdsState, manageableClustersState, manageableOrgsByClusterState]);


  return <AppRoleContext.Provider value={value}>{children}</AppRoleContext.Provider>;
};

export const useAppRole = () => {
  const ctx = useContext(AppRoleContext);
  if (!ctx) throw new Error('useAppRole must be used within AppRoleProvider');
  return ctx;
};
