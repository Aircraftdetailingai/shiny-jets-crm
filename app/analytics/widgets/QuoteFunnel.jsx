'use client';
import WidgetCard from '../WidgetCard';

const STAGES = [
  { key: 'totalCreated', label: 'Created' },
  { key: 'totalSent', label: 'Sent' },
  { key: 'totalViewed', label: 'Viewed' },
  { key: 'totalPaid', label: 'Accepted' },
  { key: 'totalCompleted', label: 'Completed' },
];

export default function QuoteFunnel({ data }) {
  const funnel = data?.funnel || {};
  const maxVal = funnel.totalCreated || 1;

  return (
    <WidgetCard title="Quote Funnel">
      <div className="flex items-end gap-2 h-full">
        {STAGES.map((stage, i) => {
          const val = funnel[stage.key] || 0;
          const pct = Math.round((val / maxVal) * 100);
          const prev = i > 0 ? (funnel[STAGES[i - 1].key] || 1) : val;
          const convRate = i > 0 && prev > 0 ? Math.round((val / prev) * 100) : null;
          return (
            <div key={stage.key} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <span className="text-v-text-primary text-lg font-light">{val}</span>
              </div>
              <div className="w-full bg-v-charcoal rounded-sm overflow-hidden" style={{ height: '48px' }}>
                <div
                  className="w-full rounded-sm transition-all duration-500"
                  style={{
                    height: `${Math.max(pct, 8)}%`,
                    background: `linear-gradient(135deg, #007CB1 ${100 - i * 20}%, #A68A3E)`,
                    opacity: 1 - i * 0.12,
                  }}
                />
              </div>
              <span className="text-[10px] text-v-text-secondary tracking-wider uppercase">{stage.label}</span>
              {convRate !== null && (
                <span className="text-[9px] text-v-gold">{convRate}%</span>
              )}
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}
