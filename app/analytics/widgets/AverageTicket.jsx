'use client';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import WidgetCard from '../WidgetCard';

export default function AverageTicket({ data }) {
  const trend = data?.valueTrend || [];
  const recent = trend.slice(-8);
  const current = recent.length > 0 ? recent[recent.length - 1].avgValue : 0;
  const prev = recent.length > 1 ? recent[recent.length - 2].avgValue : current;
  const diff = prev > 0 ? Math.round(((current - prev) / prev) * 100) : 0;

  return (
    <WidgetCard title="Average Ticket Value">
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-v-gold text-4xl font-light">${current.toLocaleString()}</p>
        <div className="flex items-center gap-1 mt-1">
          <span className={`text-xs ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {diff >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(diff)}%
          </span>
          <span className="text-[10px] text-v-text-secondary">vs last week</span>
        </div>
        <div className="w-full h-12 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={recent} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="avgTicketGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#007CB1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#007CB1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="avgValue" stroke="#007CB1" fill="url(#avgTicketGrad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </WidgetCard>
  );
}
