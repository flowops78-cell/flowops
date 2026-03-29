import React, { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };

function isLikelyStaleChunkError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  return (
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('failed to load module script') ||
    lower.includes('importing a module script failed') ||
    lower.includes('error loading dynamically imported module') ||
    (lower.includes('mime') && lower.includes('html'))
  );
}

function StaleReloadScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-stone-50 dark:bg-stone-950 p-6 text-center">
      <p className="text-sm font-medium text-stone-800 dark:text-stone-200 max-w-md">
        A new version of the app is available, or your browser is using a cached copy that no longer matches the server.
      </p>
      <button
        type="button"
        className="rounded-xl bg-stone-900 dark:bg-stone-100 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white dark:text-stone-900"
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload app
      </button>
    </div>
  );
}

/**
 * Lazy chunk failures often surface as unhandled promise rejections, not render errors.
 */
function UnhandledChunkRejectionGate({ children }: Props) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isLikelyStaleChunkError(e.reason)) {
        e.preventDefault();
        setStale(true);
      }
    };
    const onError = (e: ErrorEvent) => {
      if (isLikelyStaleChunkError(e.message)) {
        e.preventDefault();
        setStale(true);
      }
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, []);

  if (stale) {
    return <StaleReloadScreen />;
  }
  return children;
}

type BoundaryState = { stale: boolean };

/**
 * After a new deploy, cached index may reference old hashed chunks; the host returns
 * index.html for missing /assets/*.js → MIME errors. Offer a hard reload.
 */
class StaleChunkRenderBoundary extends Component<Props, BoundaryState> {
  state: BoundaryState = { stale: false };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> | null {
    return isLikelyStaleChunkError(error) ? { stale: true } : null;
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (!isLikelyStaleChunkError(error)) {
      console.error('StaleChunkBoundary (non-stale):', error, info.componentStack);
    }
  }

  render() {
    if (this.state.stale) {
      return <StaleReloadScreen />;
    }
    return this.props.children;
  }
}

export function StaleChunkBoundary({ children }: Props) {
  return (
    <UnhandledChunkRejectionGate>
      <StaleChunkRenderBoundary>{children}</StaleChunkRenderBoundary>
    </UnhandledChunkRejectionGate>
  );
}
