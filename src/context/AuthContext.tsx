import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { invokeRevokeOtherSessions } from '../lib/revokeOtherSessions';

type AuthContextType = {
  user: User | null;
  activity: Session | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: (options?: { scope?: 'local' | 'global' }) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const isIgnorableAuthError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { status?: unknown; message?: unknown; name?: unknown };
  const status = typeof candidate.status === 'number' ? candidate.status : undefined;
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.toLowerCase() : '';

  return (
    status === 401 ||
    status === 403 ||
    message.includes('session') ||
    message.includes('jwt') ||
    message.includes('token') ||
    message.includes('auth') ||
    name.includes('timeout')
  );
};

/** Stale storage, revoked session, or rotated keys — clear client and sign in again. */
const isCorruptRefreshError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; code?: string; status?: number };
  const message = String(e.message ?? '').toLowerCase();
  const code = String(e.code ?? '').toLowerCase();
  return (
    message.includes('refresh token') ||
    message.includes('invalid refresh') ||
    (message.includes('not found') && message.includes('refresh')) ||
    code.includes('refresh_token') ||
    e.status === 400
  );
};

const clearStorageKeys = (storage: Storage, matcher: (key: string) => boolean) => {
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && matcher(key)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activity, setActivity] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Generate a stable session ID for this browser tab/instance
  const [sessionId] = useState(() => {
    if (typeof window === 'undefined') return '';
    let id = sessionStorage.getItem('flow_ops_session_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('flow_ops_session_id', id);
    }
    return id;
  });

  const clearClientSessionState = useCallback(() => {
    if (typeof window !== 'undefined') {
      clearStorageKeys(sessionStorage, (key) => key === 'flow_ops_session_id' || key.startsWith('sb-') || key.startsWith('supabase.auth.'));
      clearStorageKeys(localStorage, (key) => key === 'flow_ops_last_org_id' || key.startsWith('sb-') || key.startsWith('supabase.auth.'));
    }

    setActivity(null);
    setLoading(false);
  }, []);

  const performSignOut = useCallback(async (scope: 'local' | 'global') => {
    if (!supabase) {
      clearClientSessionState();
      return;
    }

    let signOutError: unknown = null;

    try {
      const result = await Promise.race([
        supabase.auth.signOut({ scope }),
        new Promise<{ error: Error }>((resolve) => {
          globalThis.setTimeout(() => resolve({ error: new Error('Sign out timed out') }), 3000);
        }),
      ]);

      if (result.error) {
        signOutError = result.error;
      }
    } catch (error) {
      signOutError = error;
    } finally {
      clearClientSessionState();
    }

    if (signOutError && scope === 'global' && !isIgnorableAuthError(signOutError)) {
      throw signOutError;
    }
  }, [clearClientSessionState]);

  // Auth state listener — runs ONCE. Do NOT add activity to deps or the
  // listener will be torn down & re-created on every session change, causing
  // Web Locks API deadlocks ("lock was not released within 5000ms").
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    const sb = supabase;
    let mounted = true;
    // Use a ref-like variable so adoptSession always sees the latest token
    // without needing `activity` in the dependency array.
    let lastToken: string | null = null;

    const adoptSession = async (nextSession: Session | null, options?: { persistSessionId?: boolean }) => {
      if (!sb || !mounted) return;

      if (!nextSession?.access_token) {
        setActivity(null);
        setLoading(false);
        return;
      }

      // Avoid redundant adoption if token is unchanged
      if (lastToken === nextSession.access_token) {
        setLoading(false);
        return;
      }

      const { data: authUserData, error: authUserError } = await sb.auth.getUser(nextSession.access_token);
      if (!mounted) return;

      if (authUserError || !authUserData.user) {
        await performSignOut('local');
        if (!mounted) return;
        return;
      }

      lastToken = nextSession.access_token;
      setActivity(nextSession);
      setLoading(false);

      if (options?.persistSessionId !== false) {
        await sb
          .from('profiles')
          .update({ current_session_id: sessionId })
          .eq('id', nextSession.user.id);
      }
    };

    const { data } = sb.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        lastToken = null;
        clearClientSessionState();
        return;
      }

      // No session recovered on init — stale/missing storage; show login
      if (event === 'INITIAL_SESSION' && !nextSession) {
        setLoading(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED' && (!nextSession || !nextSession.access_token)) {
        lastToken = null;
        clearClientSessionState();
        return;
      }

      await adoptSession(nextSession, { persistSessionId: event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' });

      // New login: revoke other refresh sessions via Edge Function. Defer so the Supabase
      // client has committed the session before functions.invoke attaches Authorization.
      if (event === 'SIGNED_IN') {
        queueMicrotask(() => void invokeRevokeOtherSessions(sb));
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearClientSessionState, performSignOut, sessionId]);

  // Realtime single-session enforcement — re-subscribes when user changes.
  useEffect(() => {
    if (!supabase || !activity?.user) return;
    const userId = activity.user.id;

    const channel = supabase
      .channel(`single-session-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload: any) => {
          const remoteSessionId = payload.new.current_session_id;
          if (remoteSessionId && remoteSessionId !== sessionId) {
            console.warn('Concurrent session detected. Signing out...');
            void performSignOut('local');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activity?.user?.id, sessionId, performSignOut]);

  const signInWithPassword = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');

    await performSignOut('local');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setActivity(null);
      throw error;
    }

    if (!data.session?.access_token) {
      setActivity(null);
      throw new Error('Sign in succeeded without an active session.');
    }

    const { data: authUserData, error: authUserError } = await supabase.auth.getUser(data.session.access_token);
    if (authUserError || !authUserData.user) {
      setActivity(null);
      throw new Error(authUserError?.message || 'Signed in, but the session could not be validated.');
    }

    setActivity(data.session);
  };

  const signOut = async (options?: { scope?: 'local' | 'global' }) => {
    const scope = options?.scope || 'local';
    await performSignOut(scope);
  };

  const updatePassword = async (newPassword: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  const value = useMemo<AuthContextType>(() => ({
    user: activity?.user ?? null,
    activity,
    loading,
    signInWithPassword,
    signOut,
    updatePassword,
  }), [activity, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
