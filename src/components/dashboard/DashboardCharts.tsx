import { useState, type ReactNode } from 'react';
import { Calendar, Clock, Award } from 'lucide-react';
import { formatValue } from '../../lib/utils';
import { cn } from '../../lib/utils';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import MeasuredChart from '../charts/MeasuredChart';
import { useLabels } from '../../lib/labels';

interface TrendPoint {
  date: string;
  value: number;
}

interface OutcomePoint {
  name: string;
  net: number;
  isPositive: boolean;
}

interface HeatmapPoint {
  day: number;
  hour: number;
  value: number;
}

interface DashboardChartsProps {
  flowTrend: TrendPoint[];
  topOutcomes: OutcomePoint[];
  activeHeatmapData: HeatmapPoint[];
  days: string[];
  theme: 'dark' | 'light';
  sidePanel?: ReactNode;
}

export default function DashboardCharts({
  flowTrend,
  topOutcomes,
  activeHeatmapData,
  days,
  theme,
  sidePanel,
}: DashboardChartsProps) {
  const { tx, getMetricLabel } = useLabels();
  const [insightTab, setInsightTab] = useState<'outcomes' | 'hours'>('outcomes');
  const hasFlowTrend = flowTrend.some(point => Math.abs(point.value) > 0.001);
  const hasTopOutcomes = topOutcomes.length > 0;
  const hasHeatmapData = activeHeatmapData.length > 0;

  const truncateEntityLabel = (value: string) =>
    value.length > 16 ? `${value.slice(0, 15)}…` : value;

  return (
    <div className="space-y-3 lg:space-y-4">
      {sidePanel ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 section-card p-3 lg:p-4 flex flex-col">

            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                  {tx('Weekly Flow Trend')}
                </h3>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Signed net flow across applied records for the last 7 days.</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-stone-400">
                <Calendar size={12} />
                <span>{tx('Last 7 Days')}</span>
              </div>
            </div>
            <div className="h-[280px] w-full min-h-[260px] shrink-0">

              {hasFlowTrend ? (
                <MeasuredChart className="h-full w-full min-h-0 min-w-0">
                  {({ width, height }) => (
                  <AreaChart width={width} height={height} data={flowTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#292524' : '#f5f5f4'} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: theme === 'dark' ? '#78716c' : '#a8a29e' }}
                      dy={5}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: theme === 'dark' ? '#78716c' : '#a8a29e' }}
                    />
                    <Tooltip
                      formatter={(value?: number) => [formatValue(value ?? 0), tx('Net flow')]}
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                        backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
                        padding: '8px 12px',
                      }}
                      labelStyle={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: theme === 'dark' ? '#f5f5f4' : '#1c1917' }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFlow)" />
                  </AreaChart>
                  )}
                </MeasuredChart>
              ) : (
                <EmptyChartState title="No recent applied flow" description="The chart will populate as soon as applied records land in the workspace." />
              )}
            </div>
          </div>

          {sidePanel}
        </div>
      ) : (
        <div className="section-card p-3 lg:p-4 flex flex-col">

          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {tx('Weekly Flow Trend')}
              </h3>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Signed net flow across applied records for the last 7 days.</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-medium text-stone-400">
              <Calendar size={12} />
              <span>{tx('Last 7 Days')}</span>
            </div>
          </div>
          <div className="h-[280px] w-full min-h-[260px] shrink-0">

            {hasFlowTrend ? (
              <MeasuredChart className="h-full w-full min-h-0 min-w-0">
                {({ width, height }) => (
                <AreaChart width={width} height={height} data={flowTrend} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#292524' : '#f5f5f4'} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: theme === 'dark' ? '#78716c' : '#a8a29e' }}
                    dy={5}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: theme === 'dark' ? '#78716c' : '#a8a29e' }}
                  />
                  <Tooltip
                    formatter={(value?: number) => [formatValue(value ?? 0), tx('Net flow')]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                      backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
                      padding: '8px 12px',
                    }}
                    labelStyle={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: theme === 'dark' ? '#f5f5f4' : '#1c1917' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorFlow)" />
                </AreaChart>
                )}
              </MeasuredChart>
            ) : (
              <EmptyChartState title="No recent applied flow" description="The chart will populate as soon as applied records land in the workspace." />
            )}
          </div>
        </div>
      )}

      <div className="section-card p-3 lg:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="toggle-indirect-track inline-flex items-center rounded-xl border border-stone-200/90 dark:border-stone-800 p-1 gap-1 shadow-inner bg-stone-50/50 dark:bg-stone-900/50">
            <button
              onClick={() => setInsightTab('outcomes')}
              className={cn(
                'interactive-3d px-2.5 py-1 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5',
                insightTab === 'outcomes' ? 'toggle-indirect-active' : 'toggle-indirect-idle'
              )}
            >
              <Award size={12} />
              {getMetricLabel('topEntitys')}
            </button>
            <button
              onClick={() => setInsightTab('hours')}
              className={cn(
                'interactive-3d px-2.5 py-1 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5',
                insightTab === 'hours' ? 'toggle-indirect-active' : 'toggle-indirect-idle'
              )}
            >
              <Clock size={12} />
              {getMetricLabel('peakHours')}
            </button>
          </div>
          {insightTab === 'hours' && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 flex items-center gap-1">
              <Clock size={10} />
              By created time · else scheduled date
            </span>
          )}
        </div>
        <div className="h-[260px] w-full">

          {insightTab === 'outcomes' ? (
            hasTopOutcomes ? (
              <MeasuredChart className="h-full w-full min-h-0 min-w-0">
                {({ width, height }) => (
                <BarChart
                  width={width}
                  height={height}
                  data={topOutcomes}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#44403c' : '#e5e5e5'} />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={118}
                    reversed
                    tick={{ fontSize: 10, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                    tickFormatter={truncateEntityLabel}
                  />
                  <Tooltip
                    formatter={(value?: number) => formatValue(value ?? 0)}
                    contentStyle={{
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
                      color: theme === 'dark' ? '#f5f5f4' : '#1c1917',
                    }}
                    labelStyle={{ color: theme === 'dark' ? '#f5f5f4' : '#1c1917' }}
                    itemStyle={{ color: theme === 'dark' ? '#f5f5f4' : '#1c1917' }}
                  />
                  <Bar dataKey="net" radius={[0, 4, 4, 0]} barSize={16}>
                    {topOutcomes.map((record, index) => (
                      <Cell key={`cell-${index}`} fill={record.isPositive ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
                )}
              </MeasuredChart>
            ) : (
              <EmptyChartState title="No entity balances yet" description="Top entities will appear after activity records are posted to the workspace." />
            )
          ) : (
            hasHeatmapData ? (
              <MeasuredChart className="h-full w-full min-w-0">
                {({ width, height }) => (
                <ScatterChart width={width} height={height} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#33302e' : '#f5f5f4'} />
                  <XAxis
                    type="number"
                    dataKey="hour"
                    name="Hour"
                    domain={[0, 23]}
                    tickCount={13}
                    tickFormatter={(hour) => `${hour}:00`}
                    tick={{ fontSize: 10, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="day"
                    name="Day"
                    domain={[0, 6]}
                    tickCount={7}
                    tickFormatter={(day) => days[day]}
                    tick={{ fontSize: 10, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                    axisLine={false}
                    tickLine={false}
                    reversed
                  />
                  <ZAxis type="number" dataKey="value" range={[100, 1000]} name="Activities" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as HeatmapPoint;
                        return (
                          <div className="section-card p-3 shadow-xl text-xs border-none bg-white dark:bg-stone-900">
                            <p className="font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2 mb-1">
                              <Clock size={12} className="text-amber-500" />
                              {days[data.day]} at {data.hour}:00
                            </p>
                            <p className="text-stone-500 dark:text-stone-400">
                              <span className="text-stone-900 dark:text-stone-100 font-medium">{data.value}</span> activities started
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter 
                    name="Activities" 
                    data={activeHeatmapData} 
                    fill={theme === 'dark' ? '#10b981' : '#059669'} 
                    fillOpacity={0.6}
                  />
                </ScatterChart>
                )}
              </MeasuredChart>
            ) : (
              <EmptyChartState title="No activity timing yet" description="Once activities are recorded, this view will highlight the busiest hours." />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyChartState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-full min-h-[176px] items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50/70 px-6 text-center dark:border-stone-800 dark:bg-stone-900/60">
      <div className="max-w-xs space-y-1.5">
        <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</p>
        <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</p>
      </div>
    </div>
  );
}
