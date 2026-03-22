import { formatValue } from '../../lib/utils';
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts';
import MeasuredChart from './MeasuredChart';

interface AccountingChartPoint {
  name: string;
  amount: number;
}

interface AccountingChartProps {
  chartData: AccountingChartPoint[];
  theme: 'dark' | 'light';
}

export default function AccountingChart({ chartData, theme }: AccountingChartProps) {
  return (
    <div className="bg-white dark:bg-stone-900 p-6 rounded-xl shadow-sm border border-stone-200 dark:border-stone-800 h-80 min-h-[320px]">
      <h3 className="text-lg font-medium mb-6 text-stone-900 dark:text-stone-100">Flow Overview</h3>
      <MeasuredChart className="h-[248px] w-full min-w-0">
        {({ width, height }) => (
        <BarChart width={width} height={height} data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#44403c' : '#e5e5e5'} />
          <XAxis dataKey="name" tick={{ fontSize: 12, fill: theme === 'dark' ? '#a8a29e' : '#57534e' }} />
          <YAxis hide />
          <Tooltip
            formatter={(value?: number) => formatValue(value ?? 0)}
            contentStyle={{
              borderRadius: '8px',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              backgroundColor: theme === 'dark' ? '#1c1917' : '#ffffff',
              color: theme === 'dark' ? '#f5f5f4' : '#1c1917',
            }}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.name === 'Total_flow' ? '#10b981' : entry.name === 'Outflows' ? '#ef4444' : '#3b82f6'}
              />
            ))}
          </Bar>
        </BarChart>
        )}
      </MeasuredChart>
    </div>
  );
}
