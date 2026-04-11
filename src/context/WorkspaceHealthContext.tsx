import React, { createContext, useContext, useMemo } from 'react';

type WorkspaceHealthContextValue = {
  /** Workspace integrity / alerts drawer (`GlobalTelemetryPanel`). */
  openWorkspaceHealth: () => void;
};

const WorkspaceHealthContext = createContext<WorkspaceHealthContextValue | null>(null);

export function WorkspaceHealthProvider({
  openWorkspaceHealth,
  children,
}: {
  openWorkspaceHealth: () => void;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ openWorkspaceHealth }),
    [openWorkspaceHealth],
  );
  return <WorkspaceHealthContext.Provider value={value}>{children}</WorkspaceHealthContext.Provider>;
}

export function useWorkspaceHealth(): WorkspaceHealthContextValue | null {
  return useContext(WorkspaceHealthContext);
}
