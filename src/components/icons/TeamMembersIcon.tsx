import React from 'react';
import { Users } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TeamMembersIconProps {
  size?: number;
  className?: string;
}

export default function TeamMembersIcon({ size = 20, className }: TeamMembersIconProps) {
  return (
    <div className={cn("flex items-center justify-center rounded-lg bg-stone-100 dark:bg-stone-800", className)}>
      <Users size={size} className="text-stone-900 dark:text-stone-100" />
    </div>
  );
}
