import { lazy, Suspense } from 'react';
import { History } from 'lucide-react';
import LoadingLine from '../components/LoadingLine';
import { useLabels } from '../lib/labels';

const Activities = lazy(() => import('./Activities'));

export default function ActivityMonitor() {
  const { tx } = useLabels();

  return (
    <div className="page-shell space-y-8 animate-in fade-in">
      <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center shrink-0 shadow-sm border border-stone-200 dark:border-stone-700">
            <History size={24} className="text-stone-900 dark:text-stone-100" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Activity Monitor</h2>
          </div>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="section-card p-6">
            <div className="max-w-sm">
              <LoadingLine label="Loading section…" />
            </div>
          </div>
        }
      >
        <Activities embedded />
      </Suspense>
    </div>
  );
}
