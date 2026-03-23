import { createClient } from '@supabase/supabase-js';

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
