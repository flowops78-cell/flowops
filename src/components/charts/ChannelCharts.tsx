import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PieChart, TrendingUp } from 'lucide-react';
import { formatDate, formatValue } from '../../lib/utils';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
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

  const historyExtent = useMemo(() => {
    let minV = 0;
    let maxV = 0;
    for (const d of historyData) {
      if (d.total < minV) minV = d.total;
      if (d.total > maxV) maxV = d.total;
    }
    return { minV, maxV };
  }, [historyData]);

  const historyFlatZero = historyExtent.minV === 0 && historyExtent.maxV === 0;

  const historyAriaLabel = useMemo(() => {
    if (historyData.length === 0) return 'Channel history: no data.';
    if (historyFlatZero) {
      return 'Channel history: no net channel flow over the last 30 days.';
    }
    const peak = historyExtent.maxV >= Math.abs(historyExtent.minV) ? historyExtent.maxV : historyExtent.minV;
    const peakDay = historyData.reduce((best, d) =>
      Math.abs(d.total) > Math.abs(best.total) ? d : best,
    historyData[0]);
    return `Channel history: daily net flow over 30 days. Largest move ${formatValue(peak)} on ${formatDate(peakDay.fullDate)}.`;
  }, [historyData, historyExtent, historyFlatZero]);

  const tickFill = theme === 'dark' ? '#a3a3a3' : '#78716c';
  const gridStroke = theme === 'dark' ? '#3f3f46' : '#e7e5e4';
  const tooltipSurface = theme === 'dark'
    ? { backgroundColor: '#1c1917', border: '1px solid #44403c', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.35)' }
    : { backgroundColor: '#fff', border: '1px solid #e7e5e4', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
      <div className="lg:col-span-2 min-w-0 bg-white dark:bg-stone-900 p-4 lg:p-5 rounded-xl border border-stone-200 dark:border-stone-800">
        <div className="mb-1 flex items-start gap-2">
          <TrendingUp className="mt-0.5 shrink-0 text-stone-400 dark:text-stone-300" size={16} aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Channel History
            </h3>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
              Daily net flow · last 30 days
            </p>
          </div>
        </div>
        <div
          className="relative mt-3"
          role="img"
          aria-label={historyAriaLabel}
        >
          <MeasuredChart className="h-56 w-full min-w-0">
            {({ width, height }) => {
              const xMinTickGap = width < 420 ? 36 : width < 640 ? 28 : 20;
              return (
                <AreaChart
                  width={width}
                  height={height}
                  data={historyData}
                  margin={{ top: 8, right: 8, left: 4, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: tickFill, fontSize: 10 }}
                    dy={6}
                    interval="preserveStartEnd"
                    minTickGap={xMinTickGap}
                  />
                  <YAxis
                    width={44}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: tickFill, fontSize: 10 }}
                    tickFormatter={(value) => value.toString()}
                    domain={
                      historyFlatZero
                        ? [0, 1]
                        : historyExtent.minV < 0
                          ? ['auto', 'auto']
                          : [0, 'auto']
                    }
                    ticks={historyFlatZero ? [0] : undefined}
                    allowDecimals
                  />
                  <Tooltip
                    contentStyle={{
                      ...tooltipSurface,
                      borderRadius: '12px',
                      padding: '8px 12px',
                    }}
                    labelStyle={{
                      fontSize: '11px',
                      fontWeight: 'bold',
                      marginBottom: '4px',
                      color: theme === 'dark' ? '#f5f5f4' : '#1c1917',
                    }}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload as HistoryPoint | undefined;
                      return row?.fullDate ? formatDate(row.fullDate) : '';
                    }}
                    formatter={(value?: number) => [formatValue(value ?? 0), 'Net flow']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorTotal)"
                    activeDot={{
                      r: 4,
                      strokeWidth: 2,
                      stroke: theme === 'dark' ? '#1c1917' : '#fff',
                      fill: '#10b981',
                    }}
                    isAnimationActive={!historyFlatZero}
                  />
                </AreaChart>
              );
            }}
          </MeasuredChart>
          {historyFlatZero && (
            <div className="pointer-events-none absolute inset-x-2 top-8 bottom-11 flex items-center justify-center">
              <p className="max-w-[16rem] text-center text-xs leading-snug text-stone-500 dark:text-stone-400">
                No net channel flow in the last 30 days
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 bg-white dark:bg-stone-900 p-4 lg:p-5 rounded-xl border border-stone-200 dark:border-stone-800">
        <div className="mb-4 flex items-center gap-2">
          <PieChart className="text-stone-400 dark:text-stone-300" size={16} aria-hidden />
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
                        contentStyle={{
                          ...tooltipSurface,
                          borderRadius: '8px',
                          padding: '6px 10px',
                        }}
                        labelStyle={{ color: theme === 'dark' ? '#f5f5f4' : '#1c1917', fontSize: '11px', fontWeight: 600 }}
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
