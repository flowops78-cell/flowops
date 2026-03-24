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
  return (
    <div className="space-y-4 lg:space-y-5">
      {sidePanel ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 section-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">{tx('Weekly Flow Trend')}</h3>
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <Calendar size={14} />
                <span>{tx('Last 7 Days')}</span>
              </div>
            </div>
            <div className="h-48 min-h-[192px]">
              <MeasuredChart className="h-full w-full min-w-0">
                {({ width, height }) => (
                <AreaChart width={width} height={height} data={flowTrend}>
                  <defs>
                    <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#44403c' : '#e5e5e5'} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                    tickFormatter={(value) => value.toString()}
                  />
                  <Tooltip
                    formatter={(value?: number) => [formatValue(value ?? 0), tx('Flow')]}
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
                  <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorFlow)" />
                </AreaChart>
                )}
              </MeasuredChart>
            </div>
          </div>

          {sidePanel}
        </div>
      ) : (
        <div className="section-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">{tx('Weekly Flow Trend')}</h3>
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <Calendar size={14} />
              <span>{tx('Last 7 Days')}</span>
            </div>
          </div>
          <div className="h-48 min-h-[192px]">
            <MeasuredChart className="h-full w-full min-w-0">
              {({ width, height }) => (
              <AreaChart width={width} height={height} data={flowTrend}>
                <defs>
                  <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#44403c' : '#e5e5e5'} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                  tickFormatter={(value) => value.toString()}
                />
                <Tooltip
                  formatter={(value?: number) => [formatValue(value ?? 0), tx('Flow')]}
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
                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorFlow)" />
              </AreaChart>
              )}
            </MeasuredChart>
          </div>
        </div>
      )}

      <div className="section-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="toggle-indirect-track inline-flex items-center rounded-xl border border-stone-200/90 dark:border-stone-800 p-1 gap-1 shadow-inner">
            <button
              onClick={() => setInsightTab('outcomes')}
              className={cn(
                'interactive-3d px-3 py-1.5 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5',
                insightTab === 'outcomes' ? 'toggle-indirect-active' : 'toggle-indirect-idle'
              )}
            >
              <Award size={13} />
              {getMetricLabel('topEntities')}
            </button>
            <button
              onClick={() => setInsightTab('hours')}
              className={cn(
                'interactive-3d px-3 py-1.5 rounded-lg text-sm font-medium transition-all inline-flex items-center gap-1.5',
                insightTab === 'hours' ? 'toggle-indirect-active' : 'toggle-indirect-idle'
              )}
            >
              <Clock size={13} />
              {getMetricLabel('peakHours')}
            </button>
          </div>
          {insightTab === 'hours' && (
            <span className="text-xs text-stone-500 flex items-center gap-1">
              <Clock size={12} />
              Activity Start Times
            </span>
          )}
        </div>
        <div className="h-48 min-h-[192px]">
          {insightTab === 'outcomes' ? (
            <MeasuredChart className="h-full w-full min-w-0">
              {({ width, height }) => (
              <BarChart width={width} height={height} data={topOutcomes} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#44403c' : '#e5e5e5'} />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={80}
                  tick={{ fontSize: 11, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
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
                  {topOutcomes.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.net >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
              )}
            </MeasuredChart>
          ) : (
            <MeasuredChart className="h-full w-full min-w-0">
              {({ width, height }) => (
              <ScatterChart width={width} height={height} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#44403c' : '#e5e5e5'} />
                <XAxis
                  type="number"
                  dataKey="hour"
                  name="Hour"
                  domain={[0, 23]}
                  tickCount={12}
                  tickFormatter={(hour) => `${hour}:00`}
                  tick={{ fontSize: 10, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                />
                <YAxis
                  type="number"
                  dataKey="day"
                  name="Day"
                  domain={[0, 6]}
                  tickCount={7}
                  tickFormatter={(day) => days[day]}
                  tick={{ fontSize: 10, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }}
                />
                <ZAxis type="number" dataKey="value" range={[50, 400]} name="Activities" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as HeatmapPoint;
                      return (
                        <div className="section-card p-2 shadow-lg text-xs">
                          <p className="font-medium text-stone-900 dark:text-stone-100">
                            {days[data.day]} at {data.hour}:00
                          </p>
                          <p className="text-stone-500 dark:text-stone-400">{data.value} activities started</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Activities" data={activeHeatmapData} fill={theme === 'dark' ? '#10b981' : '#059669'} />
              </ScatterChart>
              )}
            </MeasuredChart>
          )}
        </div>
      </div>
    </div>
  );
}
