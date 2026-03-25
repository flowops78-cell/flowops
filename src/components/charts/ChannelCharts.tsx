import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PieChart, TrendingUp } from 'lucide-react';
import { formatValue } from '../../lib/utils';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart as RePieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface HistoryPoint {
  date: string;
  total: number;
  fullDate: string;
}

interface DistributionPoint {
  name: string;
  value: number;
  color: string;
}

interface ChannelChartsProps {
  historyData: HistoryPoint[];
  distributionData: DistributionPoint[];
  theme: 'dark' | 'light';
}

function MeasuredChart({
  className,
  children,
}: {
  className: string;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
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

export default function ChannelCharts({ historyData, distributionData, theme }: ChannelChartsProps) {
  const [selectedSliceIndex, setSelectedSliceIndex] = useState(0);

  useEffect(() => {
    if (distributionData.length === 0) {
      setSelectedSliceIndex(0);
      return;
    }
    setSelectedSliceIndex((current) => Math.min(current, distributionData.length - 1));
  }, [distributionData]);

  const totalDistribution = useMemo(
    () => distributionData.reduce((sum, item) => sum + item.value, 0),
    [distributionData],
  );

  const selectedSlice = distributionData[selectedSliceIndex];
  const selectedSliceShare =
    selectedSlice && totalDistribution > 0
      ? `${((selectedSlice.value / totalDistribution) * 100).toFixed(1)}%`
      : '0%';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
      <div className="lg:col-span-2 min-w-0 bg-white dark:bg-stone-900 p-4 lg:p-5 rounded-xl border border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="text-stone-400" size={16} />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Channel History</h3>
        </div>
        <MeasuredChart className="h-56 w-full min-w-0">
          {({ width, height }) => (
            <AreaChart width={width} height={height} data={historyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#292524' : '#f5f5f4'} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#a8a29e', fontSize: 10 }} 
                dy={5} 
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#a8a29e', fontSize: 10 }}
                tickFormatter={(value) => value.toString()}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: theme === 'dark' ? '#1c1917' : '#fff',
                  borderRadius: '12px',
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                  padding: '8px 12px',
                }}
                labelStyle={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: theme === 'dark' ? '#f5f5f4' : '#1c1917' }}
                formatter={(value?: number) => [formatValue(value ?? 0), 'Total']}
              />
              <Area type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorTotal)" />
            </AreaChart>
          )}
        </MeasuredChart>
      </div>

      <div className="min-w-0 bg-white dark:bg-stone-900 p-4 lg:p-5 rounded-xl border border-stone-200 dark:border-stone-800">
        <div className="flex items-center gap-2 mb-4">
          <PieChart className="text-stone-400" size={16} />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Values Distribution</h3>
        </div>
        <div className="h-72 w-full min-w-0">
          {distributionData.length > 0 ? (
            <div className="h-full flex flex-col min-h-0 gap-2">
              <MeasuredChart className="h-44 w-full min-w-0">
                {({ width, height }) => {
                  const chartSize = Math.max(120, Math.min(width, height));
                  const outerRadius = Math.max(48, Math.floor(chartSize * 0.3));
                  const innerRadius = Math.max(28, Math.floor(outerRadius * 0.62));

                  return (
                    <RePieChart width={width} height={height}>
                      <Pie
                        data={distributionData}
                        cx="50%"
                        cy="50%"
                        innerRadius={innerRadius}
                        outerRadius={outerRadius}
                        paddingAngle={3}
                        dataKey="value"
                        onClick={(_, index) => setSelectedSliceIndex(index)}
                      >
                        {distributionData.map((record, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={record.color}
                            stroke={index === selectedSliceIndex ? 'rgba(255,255,255,0.92)' : 'transparent'}
                            strokeWidth={index === selectedSliceIndex ? 2 : 0}
                            className="cursor-pointer"
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value?: number) => formatValue(value ?? 0)}
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e5e5' }}
                      />
                    </RePieChart>
                  );
                }}
              </MeasuredChart>

              <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/50 px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-stone-500 dark:text-stone-400">Selected</span>
                  <span className="font-mono text-stone-900 dark:text-stone-100">{selectedSlice ? formatValue(selectedSlice.value) : '0 entities'}</span>
                </div>
                <div className="mt-1 text-xs text-stone-600 dark:text-stone-300 truncate" title={selectedSlice?.name || ''}>
                  {selectedSlice?.name || '—'} · {selectedSliceShare}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto space-y-1 pr-1">
                {distributionData.map((record, index) => {
                  const share = totalDistribution > 0 ? (record.value / totalDistribution) * 100 : 0;
                  const isActive = index === selectedSliceIndex;

                  return (
                    <button
                      key={`${record.name}-${index}`}
                      type="button"
                      onClick={() => setSelectedSliceIndex(index)}
                      className={
                        `w-full rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ` +
                        (isActive
                          ? 'border-stone-400 dark:border-stone-500 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100'
                          : 'border-stone-200 dark:border-stone-700 bg-white/80 dark:bg-stone-900/70 text-stone-600 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-900')
                      }
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: record.color }} />
                          <span className="truncate" title={record.name}>{record.name}</span>
                        </span>
                        <span className="font-mono shrink-0">{share.toFixed(1)}%</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-stone-400 text-sm text-center">No values available to display</div>
          )}
        </div>
      </div>
    </div>
  );
}
