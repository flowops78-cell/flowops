import { RefObject, useEffect, useRef, useState } from 'react';

export function useTextOverflow<TContainer extends HTMLElement, TProbe extends HTMLElement = TContainer>(dependencies: readonly unknown[] = []) {
  const containerRef = useRef<TContainer>(null);
  const probeRef = useRef<TProbe>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const probe = probeRef.current;
    if (!container || !probe) {
      setIsOverflowing(false);
      return;
    }

    let animationFrameId: number | null = null;

    const measure = () => {
      const containerTarget = containerRef.current;
      const probeTarget = probeRef.current;
      if (!containerTarget || !probeTarget) {
        setIsOverflowing(false);
        return;
      }

      const nextOverflow = probeTarget.scrollWidth - containerTarget.clientWidth > 1;
      setIsOverflowing(previous => (previous === nextOverflow ? previous : nextOverflow));
    };

    const scheduleMeasure = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();

    const resizeObserver = new ResizeObserver(scheduleMeasure);
  resizeObserver.observe(container);
  resizeObserver.observe(probe);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, dependencies);

  return {
    containerRef,
    probeRef,
    isOverflowing,
  } as {
    containerRef: RefObject<TContainer>;
    probeRef: RefObject<TProbe>;
    isOverflowing: boolean;
  };
}
