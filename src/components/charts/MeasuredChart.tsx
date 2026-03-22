import { useEffect, useRef, useState, type ReactNode } from 'react';

interface MeasuredChartProps {
  className: string;
  children: (size: { width: number; height: number }) => ReactNode;
}

export default function MeasuredChart({ className, children }: MeasuredChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((prev) => {
        if (prev.width === width && prev.height === height) return prev;
        return { width, height };
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {size.width > 0 && size.height > 0 ? children(size) : <div className="h-full w-full" />}
    </div>
  );
}
