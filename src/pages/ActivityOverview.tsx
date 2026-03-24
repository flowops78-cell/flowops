import { lazy, Suspense } from 'react';
import ContextBreadcrumbs from '../components/ContextBreadcrumbs';
import LoadingLine from '../components/LoadingLine';
import { useLabels } from '../lib/labels';

const Brief = lazy(() => import('./Channels'));

export default function ActivityOverview() {
  const { tx } = useLabels();

  return (
    <div className="page-shell space-y-6 animate-in fade-in">
      <div className="section-card px-5 py-3.5 lg:px-6">
        <ContextBreadcrumbs items={[tx('Brief')]} className="mb-1.5" />
        <h2 className="text-xl font-light text-stone-900 dark:text-stone-100">{tx('Brief')}</h2>
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
        <Brief embedded />
      </Suspense>
    </div>
  );
}
