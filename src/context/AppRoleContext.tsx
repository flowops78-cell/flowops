import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { AppRole, normalizeAppRole } from '../lib/roles';
import { useAuth } from './AuthContext';

export type { AppRole } from '../lib/roles';

type AppRoleContextType = {
  role: AppRole;
  setRole: (role: AppRole) => void;
  roleLocked: boolean;
  canAccessAdminUi: boolean;
  canOperateLog: boolean;
  canManageValue: boolean;
  canAlign: boolean;
};

const APP_ROLE_STORAGE_KEY = 'flow_ops_role';

const AppRoleContext = createContext<AppRoleContextType | undefined>(undefined);

export const AppRoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [role, setRoleState] = useState<AppRole>('viewer');
  const [profileRole, setProfileRole] = useState<AppRole | null>(null);
  const roleFromMetadata = user?.user_metadata?.app_role;
  const metadataRole = normalizeAppRole(roleFromMetadata);
  const effectiveServerRole = metadataRole ?? profileRole;
  const roleLocked = isSupabaseConfigured && !!user;

  useEffect(() => {
    let cancelled = false;

    const loadProfileRole = async () => {
      if (!isSupabaseConfigured || !supabase || !user?.id) {
        setProfileRole(null);
        return;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setProfileRole(null);
        return;
      }

      const roleFromProfile = normalizeAppRole(data?.role);
      setProfileRole(roleFromProfile);
    };

    void loadProfileRole();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
    const canManageValue = role === 'admin' || role === 'operator';
    const canAlign = role === 'admin';
    return {
      role,
      setRole,
      roleLocked,
      canAccessAdminUi,
      canOperateLog,
      canManageValue,
      canAlign,
    };
  }, [role, roleLocked]);

  return <AppRoleContext.Provider value={value}>{children}</AppRoleContext.Provider>;
};

export const useAppRole = () => {
  const ctx = useContext(AppRoleContext);
  if (!ctx) throw new Error('useAppRole must be used within AppRoleProvider');
  return ctx;
};
