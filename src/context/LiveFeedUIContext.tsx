import React, { createContext, useContext, useMemo } from 'react';

type LiveFeedUIContextValue = {
  /** Workspace integrity / alerts drawer (`GlobalTelemetryPanel`). */
  openWorkspaceHealth: () => void;
};

const LiveFeedUIContext = createContext<LiveFeedUIContextValue | null>(null);

export function LiveFeedUIProvider({
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
  return <LiveFeedUIContext.Provider value={value}>{children}</LiveFeedUIContext.Provider>;
}

export function useLiveFeedUI(): LiveFeedUIContextValue | null {
  return useContext(LiveFeedUIContext);
}
