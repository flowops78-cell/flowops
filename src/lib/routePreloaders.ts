const routePreloaders: Record<string, () => Promise<unknown>> = {
  '/': () => Promise.all([
    import('../pages/Dashboard'),
  ]),
  '/activity': () => Promise.all([
    import('../pages/ActivityMonitor'),
    import('../pages/Activities'),
  ]),
  '/channels': () => Promise.all([
    import('../pages/BriefFlowOverview'),
    import('../pages/Channels'),
  ]),
  '/channels-fallback': () => Promise.all([
    preloadRoute('/channels'),
  ]),
  '/contacts': () => Promise.all([
    import('../pages/PartnerNetwork'),
  ]),
  '/team': () => Promise.all([
    import('../pages/Team'),
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

export const preloadCoreRoutesOnIdle = () => {
  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    void Promise.all([
      preloadRoute('/'),
      preloadRoute('/activity'),
      preloadRoute('/channels'),
      preloadRoute('/contacts'),
      preloadRoute('/team'),
      preloadRoute('/settings'),
    ]);
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
