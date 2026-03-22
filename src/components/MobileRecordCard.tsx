import React from 'react';

type MobileRecordCardProps = {
  title: React.ReactNode;
  right?: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
};

export default function MobileRecordCard({ title, right, meta, children }: MobileRecordCardProps) {
  return (
    <div className="p-4 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm font-medium text-stone-900 dark:text-stone-100">{title}</div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {meta && <div className="text-xs text-stone-500 dark:text-stone-400">{meta}</div>}
      {children}
    </div>
  );
}