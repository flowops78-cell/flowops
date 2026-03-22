import React from 'react';

type DeferredRenderProps = {
  children: React.ReactNode;
  fallback: React.ReactNode;
  rootMargin?: string;
};

export default function DeferredRender({
  children,
  fallback,
  rootMargin = '220px',
}: DeferredRenderProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = React.useState(false);

  React.useEffect(() => {
    if (shouldRender) return;

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setShouldRender(true);
      },
      { rootMargin }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    let idleCallbackId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleCallbackId = window.requestIdleCallback(() => setShouldRender(true), { timeout: 1800 });
    } else {
      timeoutId = globalThis.setTimeout(() => setShouldRender(true), 1400);
    }

    return () => {
      observer.disconnect();
      if (idleCallbackId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [rootMargin, shouldRender]);

  return <div ref={containerRef}>{shouldRender ? children : fallback}</div>;
}
