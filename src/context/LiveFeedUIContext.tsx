import React, { createContext, useContext, useMemo } from 'react';

type LiveFeedUIContextValue = {
  /** Activity list drawer (`LiveFeedPanel` → browse/open work sessions). */
  openLiveFeed: () => void;
  /** Workspace integrity / alerts drawer (`GlobalTelemetryPanel` — not the activity list, not Settings export). */
  openWorkspaceHealth: () => void;
};

const LiveFeedUIContext = createContext<LiveFeedUIContextValue | null>(null);

export function LiveFeedUIProvider({
  children,
  openLiveFeed,
  openWorkspaceHealth,
}: {
  children: React.ReactNode;
  openLiveFeed: () => void;
  openWorkspaceHealth: () => void;
}) {
  const value = useMemo(
    () => ({ openLiveFeed, openWorkspaceHealth }),
    [openLiveFeed, openWorkspaceHealth],
  );
  return <LiveFeedUIContext.Provider value={value}>{children}</LiveFeedUIContext.Provider>;
}

export function useLiveFeedUI(): LiveFeedUIContextValue | null {
  return useContext(LiveFeedUIContext);
}
