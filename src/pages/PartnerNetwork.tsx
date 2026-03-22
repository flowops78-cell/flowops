import { lazy, Suspense } from 'react';
import { Users } from 'lucide-react';
import ContextBreadcrumbs from '../components/ContextBreadcrumbs';
import LoadingLine from '../components/LoadingLine';

const PartnersPage = lazy(() => import('./Partners'));

export default function PartnerNetwork() {
  return (
    <div className="page-shell space-y-8 animate-in fade-in">
      <div className="section-card p-5 lg:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <ContextBreadcrumbs items={['Partners']} className="mb-2" />
          <h2 className="text-2xl font-light text-stone-900 dark:text-stone-100">Partners</h2>
        </div>
        <div className="inline-flex items-center rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-stone-100/80 dark:bg-stone-900 p-2 gap-2 shadow-inner w-full lg:w-auto justify-center lg:justify-start">
          <Users size={16} className="text-stone-600 dark:text-stone-300" />
          <span className="text-sm font-medium text-stone-700 dark:text-stone-200">Partners Workspace</span>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="section-card p-6">
            <div className="max-w-sm">
              <LoadingLine label="Loading section..." />
            </div>
          </div>
        }
      >
        <PartnersPage embedded />
      </Suspense>
    </div>
  );
}
