const routePreloaders: Record<string, () => Promise<unknown>> = {
  '/': () => Promise.all([
    import('../pages/Dashboard'),
  ]),
  '/activity': () => import('../pages/Activities'),
  '/channels': () => Promise.all([
    import('../pages/ActivityOverview'),
    import('../pages/Channels'),
  ]),
  '/channels-fallback': () => Promise.all([
    preloadRoute('/channels'),
  ]),
  '/collaborations': () => Promise.all([
    import('../pages/CollaborationNetwork'),
  ]),
  '/roster': () => Promise.all([
    import('../pages/RosterPage'),
  ]),
  '/settings': () => Promise.all([
    import('../pages/Settings'),
  ]),
  '/auth': () => import('../pages/Auth'),
};

export const preloadRoute = (route: string) => {
  const loader = routePreloaders[route];
  if (!loader) return Promise.resolve();
  return loader().then(() => undefined).catch(() => undefined);
};

/**
 * Preload a small set of high-traffic chunks after idle so first navigation is snappy,
 * without pulling every admin route during the same window as DataContext’s ~14 parallel
 * Supabase requests (bandwidth / main-thread parse contention on cold load).
 */
export const preloadCoreRoutesOnIdle = () => {
  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    void Promise.all([preloadRoute('/'), preloadRoute('/activity')]);
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(run, { timeout: 1400 });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(idleId);
    };
  }

  const timer = globalThis.setTimeout(run, 700);
  return () => {
    cancelled = true;
    globalThis.clearTimeout(timer);
  };
};
