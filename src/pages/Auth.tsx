import React, { useEffect, useState } from 'react';
import { LogIn, UserPlus, Eye, EyeOff, ShieldCheck, Mail, Info, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { AppRole } from '../lib/roles';
import { AUTH_PERSIST_ACTIVITY_KEY, isSupabaseConfigured, supabase, SUPABASE_ANON_KEY } from '../lib/supabase';
import { useNotification } from '../context/NotificationContext';
import { LABELS, tx } from '../lib/labels';
import { cn } from '../lib/utils';

type RequestedRole = AppRole;

type SubmitAccessRequestResult = {
  ok?: boolean;
  login_id?: string;
  requested_role?: string;
};

const ROLE_DOMAIN_MAP: Record<Exclude<RequestedRole, 'viewer'>, string> = {
  admin: 'admin.os',
  operator: 'operator.os',
};

export default function Auth() {
  const { signInWithPassword } = useAuth();
  const { notify } = useNotification();
  const [mode, setMode] = useState<'signin' | 'request'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requestInviteToken, setRequestInviteToken] = useState('');
  const [requestUsername, setRequestUsername] = useState('');
  const [requestRole, setRequestRole] = useState<Exclude<RequestedRole, 'viewer'>>('operator');
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const persisted = sessionStorage.getItem(AUTH_PERSIST_ACTIVITY_KEY);
    if (persisted === '0') {
      setKeepSignedIn(false);
      return;
    }
    setKeepSignedIn(true);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setRequestSuccess(null);
    setSubmitting(true);
    try {
      if (mode === 'request') {
        if (!isSupabaseConfigured || !supabase) {
          throw new Error('Supabase is not configured. Cannot submit access request in demo mode.');
        }

        const username = requestUsername.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
          throw new Error('Username tag can only use lowercase letters, numbers, dot, underscore, and hyphen.');
        }

        const inviteToken = requestInviteToken.trim();
        if (inviteToken.length < 16) {
          throw new Error('Invite token is required.');
        }

        const { data, error: requestError } = await supabase.functions.invoke<SubmitAccessRequestResult>('submit-access-request', {
          body: {
            invite_token: inviteToken,
            username,
            requested_role: requestRole,
          },
        });

        if (requestError) throw requestError;

        const loginId = data?.login_id ?? `${username}@${ROLE_DOMAIN_MAP[requestRole]}`;
        setRequestSuccess(`Access request submitted. Your login ID will be ${loginId}. After approval, sign in with the initial password set by your admin.`);
        notify({ type: 'success', message: `Access request submitted for ${loginId}.` });
        setRequestInviteToken('');
        setRequestUsername('');
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      await signInWithPassword(normalizedEmail, password, { keepSignedIn });
      notify({ type: 'success', message: 'Signed in successfully.' });
    } catch (authError: any) {
      const rawMessage = authError?.message || 'Request failed.';
      const lowered = String(rawMessage).toLowerCase();
      if (lowered.includes('access_requests') || lowered.includes('access_invites') || lowered.includes('submit-access-request') || lowered.includes('pgrst205') || lowered.includes('schema cache')) {
        setError('Access request workflow is not enabled yet. Apply supabase/migrations/00000000000000_init_canonical_schema.sql, deploy the submit-access-request edge function, and set SB_SERVICE_ROLE_KEY (and CORS origins) in function secrets.');
        notify({ type: 'error', message: 'Access workflow not enabled.' });
      } else if (lowered.includes('invalid login credentials')) {
        setError('Invalid credentials. If recently approved, use the initial password set during approval.');
        notify({ type: 'error', message: 'Invalid login credentials.' });
      } else {
        setError(authError?.message || 'Unable to sign in.');
        notify({ type: 'error', message: authError?.message || 'Unable to sign in.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 dark:bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-stone-500/5 dark:bg-stone-500/10 blur-[120px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="backdrop-blur-xl bg-white/80 dark:bg-stone-900/80 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="p-8 pb-4 text-center">
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 mb-4 shadow-lg"
            >
              <ShieldCheck size={24} />
            </motion.div>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Flow Ops</h1>
          </div>

          {/* Mode Switcher */}
          <div className="px-8 flex justify-center">
            <div className="p-1 bg-stone-100 dark:bg-stone-800/50 rounded-xl flex gap-1 w-full max-w-[280px]">
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); setRequestSuccess(null); }}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200",
                  mode === 'signin' 
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm" 
                    : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                )}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('request'); setError(null); setRequestSuccess(null); }}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200",
                  mode === 'request' 
                    ? "bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm" 
                    : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                )}
              >
                Request Access
              </button>
            </div>
          </div>

          <div className="p-8 pt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === 'signin' ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === 'signin' ? 10 : -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Global Status messages */}
                {!isSupabaseConfigured && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-amber-200 bg-amber-50/50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-400 px-4 py-3 text-xs flex flex-col gap-2">
                    <div className="flex gap-3">
                      <Info size={16} className="shrink-0" />
                      <span className="font-bold uppercase tracking-tight">Configuration Required</span>
                    </div>
                    <p className="pl-7 leading-relaxed opacity-90">
                      The application cannot detect your Supabase URL or Keys. This usually happens after an environment variable rename.
                    </p>
                    <div className="pl-7 mt-1">
                      <span className="inline-block px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40 font-mono text-[10px] border border-amber-200 dark:border-amber-800">
                        Please restart your dev server (Ctrl+C & npm run dev)
                      </span>
                    </div>
                  </motion.div>
                )}
                {error && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-red-200 bg-red-50/50 text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400 px-4 py-3 text-xs flex gap-3">
                    <Info size={16} className="shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
                {requestSuccess && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-emerald-200 bg-emerald-50/50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-400 px-4 py-3 text-xs flex gap-3">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>{requestSuccess}</span>
                  </motion.div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {mode === 'signin' ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 dark:text-stone-500 ml-1">Login ID</label>
                        <div className="relative group">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                          <input
                            type="text"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-sm focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100 focus:border-transparent outline-none transition-all placeholder:text-stone-300 dark:placeholder:text-stone-700"
                            placeholder="alex@operator.os"
                            autoComplete="username"
                            autoCapitalize="none"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 dark:text-stone-500 ml-1">Password</label>
                        <div className="relative group">
                          <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            onKeyUp={event => setCapsLockOn(event.getModifierState('CapsLock'))}
                            className="w-full pl-10 pr-12 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-sm focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100 focus:border-transparent outline-none transition-all placeholder:text-stone-300 dark:placeholder:text-stone-700"
                            placeholder="••••••••"
                            autoComplete="current-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                          >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        {capsLockOn && <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium px-1 animate-pulse">Caps Lock is Active</p>}
                      </div>

                      <div className="flex flex-col gap-2 pt-2">
                        <label className="flex items-center gap-2.5 text-xs text-stone-500 dark:text-stone-400 cursor-pointer group">
                          <input type="checkbox" checked={keepSignedIn} onChange={e => setKeepSignedIn(e.target.checked)} className="rounded-md border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:ring-offset-0 focus:ring-0 w-4 h-4" />
                          <span className="group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors tracking-tight">Keep this tab signed in</span>
                        </label>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 px-1">Authentication is stored in session storage and clears when the browser tab is closed.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 dark:text-stone-500 ml-1">{tx('Role')}</label>
                        <select
                          value={requestRole}
                          onChange={e => setRequestRole(e.target.value as Exclude<RequestedRole, 'viewer'>)}
                          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-sm focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100 outline-none transition-all appearance-none cursor-pointer"
                        >
                          <option value="operator">{tx('Operator')}</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 dark:text-stone-500 ml-1">Username</label>
                        <div className="flex rounded-xl overflow-hidden border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 focus-within:ring-2 focus-within:ring-stone-900 dark:focus-within:ring-stone-100 transition-all">
                          <input
                            type="text"
                            required
                            value={requestUsername}
                            onChange={e => setRequestUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                            className="flex-1 px-4 py-2.5 bg-transparent border-none focus:ring-0 outline-none text-sm w-full"
                            placeholder="alex"
                          />
                           <span className="inline-flex items-center px-4 bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 text-xs font-mono border-l border-stone-200 dark:border-stone-800">
                            @{ROLE_DOMAIN_MAP[requestRole as keyof typeof ROLE_DOMAIN_MAP]}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-bold text-stone-400 dark:text-stone-500 ml-1">Invite Token</label>
                        <input
                          type="text"
                          required
                          value={requestInviteToken}
                          onChange={e => setRequestInviteToken(e.target.value.trim())}
                          className="w-full px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-sm focus:ring-2 focus:ring-stone-900 dark:focus:ring-stone-100 outline-none transition-all placeholder:text-stone-300 dark:placeholder:text-stone-700"
                          placeholder="Paste the invite token shared by admin"
                          autoCapitalize="none"
                        />
                        <p className="text-[10px] text-stone-500 dark:text-stone-400 px-1">This invite decides which workspace you’re asking to join.</p>
                      </div>
                    </>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-3 rounded-xl hover:bg-stone-800 dark:hover:bg-white transition-all text-sm font-bold shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10 disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                  >
                    {submitting ? (
                      <div className="w-5 h-5 border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        {mode === 'signin' ? <LogIn size={18} /> : <UserPlus size={18} />}
                        <span>{mode === 'signin' ? 'Sign In' : 'Request Access'}</span>
                      </>
                    )}
                  </motion.button>
                </form>
              </motion.div>
            </AnimatePresence>
          </div>
          
          {/* Legal Footer */}
          <div className="px-8 pb-8 pt-2 border-t border-stone-100 dark:border-stone-800/50 bg-stone-50/50 dark:bg-stone-900/40">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400 font-medium">
                <div className="flex gap-4">
                  <a href="/legal/terms.md" target="_blank" rel="noopener noreferrer" className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors">Terms</a>
                  <a href="/legal/privacy.md" target="_blank" rel="noopener noreferrer" className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors">Privacy</a>
                  <a href="#license" className="hover:text-stone-900 dark:hover:text-stone-100 transition-colors">License</a>
                </div>
                <div>© 2026 Flow Ops</div>
              </div>
              
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-stone-200/40 dark:bg-stone-800/20 text-[10px] text-stone-600 dark:text-stone-500 leading-tight">
                <ShieldCheck size={12} className="shrink-0 text-emerald-500/70" />
                <span>Enterprise Grade Security • 256-bit encryption • SOC-2 Compliance Path</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
