import React from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutGrid, Clock } from 'lucide-react';

export default function WaitingAssignment() {
  const { signOut, user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 p-4 dark:bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 rounded-full bg-amber-50 p-4 dark:bg-amber-950/30">
            <Clock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
          </div>
          <h1 className="text-2xl font-light text-stone-900 dark:text-stone-100">Awaiting Assignment</h1>
          <p className="mt-4 text-stone-600 dark:text-stone-400">
            Hello <span className="font-medium text-stone-900 dark:text-stone-200">{user?.email}</span>. 
            Your account has been created, but it is not currently assigned to an operational organization.
          </p>
        </div>

        <div className="space-y-4 rounded-xl bg-stone-50 p-5 dark:bg-stone-800/50">
          <div className="flex items-start gap-3">
            <LayoutGrid className="mt-0.5 h-5 w-5 text-stone-400" />
            <div className="text-sm">
              <p className="font-medium text-stone-900 dark:text-stone-100">Next Steps</p>
              <p className="mt-1 text-stone-500 dark:text-stone-400">
                Please contact your Cluster Administrator to be assigned to a working activity. Once assigned, you will be able to access the dashboard.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
          >
            Check Status
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-600 transition-all hover:bg-stone-50 dark:border-stone-800 dark:text-stone-400 dark:hover:bg-stone-800"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
        
        <p className="text-center text-xs text-stone-400">
          Security policy: access requires an active organization assignment.
        </p>
      </div>
    </div>
  );
}
