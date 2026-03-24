import { lazy, Suspense } from 'react';
import ContextBreadcrumbs from '../components/ContextBreadcrumbs';
import LoadingLine from '../components/LoadingLine';
import { useLabels } from '../lib/labels';

const Activities = lazy(() => import('./Activities'));

export default function ActivityMonitor() {
  const { tx } = useLabels();

  return (
    <div className="page-shell space-y-8 animate-in fade-in">
      <div className="section-card p-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <ContextBreadcrumbs items={[tx('Activity'), tx('Overview')]} />
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
