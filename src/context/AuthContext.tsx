import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { AUTH_PERSIST_ACTIVITY_KEY, isSupabaseConfigured, supabase } from '../lib/supabase';

type AuthContextType = {
  user: User | null;
  activity: Session | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string, options?: { keepSignedIn?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const adoptSession = async (nextSession: Session | null, options?: { persistSessionId?: boolean }) => {
      const client = supabase;
      if (!client || !mounted) return;

      if (!nextSession?.access_token) {
        setActivity(null);
        setLoading(false);
        return;
      }

      const { data: authUserData, error: authUserError } = await client.auth.getUser(nextSession.access_token);
      if (!mounted) return;

      if (authUserError || !authUserData.user) {
        await client.auth.signOut({ scope: 'local' });
        if (!mounted) return;
        setActivity(null);
        setLoading(false);
        return;
      }

      setActivity(nextSession);
      setLoading(false);

      if (options?.persistSessionId !== false) {
        await client
          .from('profiles')
          .update({ current_session_id: sessionId })
          .eq('id', nextSession.user.id);
      }
    };

    const bootstrap = async () => {
      const client = supabase;
      if (!client) return;
      const { data } = await client.auth.getSession();
      await adoptSession(data.session);
    };

    void bootstrap();

    const { data } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        setActivity(null);
        setLoading(false);
        return;
      }

      await adoptSession(nextSession, { persistSessionId: event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' });
    });

    // Realtime enforcement for Single Session
    let channel: any;
    const client = supabase;
    if (activity?.user && client) {
      channel = client
        .channel(`single-session-${activity.user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${activity.user.id}`,
          },
          (payload: any) => {
            const remoteSessionId = payload.new.current_session_id;
            if (remoteSessionId && remoteSessionId !== sessionId) {
              // Remote login detected! Force logout local session
              console.warn('Concurrent session detected. Signing out...');
              void client.auth.signOut({ scope: 'local' });
            }
          }
        )
        .subscribe();
    }

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
      if (channel && client) client.removeChannel(channel);
    };
  }, [activity?.user?.id]);

  const signInWithPassword = async (email: string, password: string, options?: { keepSignedIn?: boolean }) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    if (typeof window !== 'undefined' && typeof options?.keepSignedIn === 'boolean') {
      sessionStorage.setItem(AUTH_PERSIST_ACTIVITY_KEY, options.keepSignedIn ? '1' : '0');
    }

    const clearError = await supabase.auth.signOut({ scope: 'local' });
    if (clearError.error) {
      const status = typeof (clearError.error as { status?: unknown }).status === 'number'
        ? (clearError.error as { status: number }).status
        : undefined;
      const message = (clearError.error.message ?? '').toLowerCase();
      const ignorable = status === 401 || status === 403 || message.includes('session') || message.includes('jwt');
      if (!ignorable) throw clearError.error;
    }

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

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (!error) {
      setActivity(null);
      return;
    }

    const status = typeof (error as { status?: unknown }).status === 'number'
      ? (error as { status: number }).status
      : undefined;
    const message = (error.message ?? '').toLowerCase();
    const isAlreadySignedOut = status === 401 || status === 403 || message.includes('session') || message.includes('jwt');

    if (isAlreadySignedOut) {
      setActivity(null);
      return;
    }

    throw error;
  };

  const value = useMemo<AuthContextType>(() => ({
    user: activity?.user ?? null,
    activity,
    loading,
    signInWithPassword,
    signOut,
  }), [activity, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
