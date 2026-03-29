import React, { lazy, Suspense } from 'react';
import ContextPanel from './ContextPanel';
import LoadingLine from './LoadingLine';
import { LABELS } from '../lib/labels';
const ActivityMonitor = lazy(() => import('../pages/ActivityMonitor'));

interface LiveFeedPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LiveFeedPanel({ isOpen, onClose }: LiveFeedPanelProps) {
  return (
    <ContextPanel isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col h-full bg-stone-50/50 dark:bg-stone-900/50 backdrop-blur-xl">
        <div className="px-6 py-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-stone-900 dark:text-stone-100 tracking-tight">{LABELS.workspacePanels.activityList.title}</h3>
            <p className="text-[10px] uppercase tracking-widest text-stone-500 font-medium mt-0.5">{LABELS.workspacePanels.activityList.subtitle}</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden p-4">
          <Suspense
            fallback={
              <div className="flex min-h-[200px] items-center justify-center px-4">
                <div className="w-full max-w-xs">
                  <LoadingLine compact label="Loading activities…" />
                </div>
              </div>
            }
          >
            <ActivityMonitor embedded />
          </Suspense>
        </div>
        
        <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-white/50 dark:bg-stone-900/50">
          <p className="text-[10px] text-center text-stone-400 font-mono">
            SYNCED WITH CLOUD INFRASTRUCTURE
          </p>
        </div>
      </div>
    </ContextPanel>
  );
}
