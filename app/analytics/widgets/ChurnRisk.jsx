'use client';
import WidgetCard from '../WidgetCard';

const RISK_STYLES = {
  warning: { bg: 'bg-v-gold/10', text: 'text-v-gold', label: '60-89d' },
  danger: { bg: 'bg-orange-500/10', text: 'text-orange-400', label: '90-119d' },
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', label: '120d+' },
};

export default function ChurnRisk({ data }) {
  const risks = data?.churnRisk || [];

  return (
    <WidgetCard title="Churn Risk" subtitle="Customers who haven't booked recently">
      <div className="space-y-1 h-full overflow-y-auto">
        {risks.length === 0 && <p className="text-v-text-secondary text-sm text-center py-6">No at-risk customers</p>}
        {risks.map((c, i) => {
          const style = RISK_STYLES[c.riskLevel] || RISK_STYLES.warning;
          return (
            <div key={c.email || i} className="flex items-center gap-3 py-1.5 border-b border-v-border-subtle last:border-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${style.bg.replace('/10', '')} ${style.text.replace('text-', 'bg-')}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-v-text-primary truncate">{c.name}</p>
                <p className="text-[10px] text-v-text-secondary truncate">{c.email}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${style.bg} ${style.text}`}>
                  {c.daysSinceService}d ago
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}
