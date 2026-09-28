'use client';
import WidgetCard from '../WidgetCard';

export default function CustomerLTV({ data }) {
  const customers = data?.customerLTV || [];

  return (
    <WidgetCard title="Customer LTV" subtitle="Top 10 by lifetime value">
      <div className="space-y-1 h-full overflow-y-auto">
        {customers.length === 0 && (
          <p className="text-v-text-secondary text-sm text-center py-6">
            {data?.customerCount > 0
              ? `No accepted or paid work yet across your ${data.customerCount} customer${data.customerCount === 1 ? '' : 's'}`
              : 'No customer data yet'}
          </p>
        )}
        {customers.map((c, i) => (
          <div key={c.email || i} className="flex items-center gap-3 py-1.5 border-b border-v-border-subtle last:border-0">
            <span className={`w-6 h-6 flex items-center justify-center text-[10px] font-medium rounded-full flex-shrink-0 ${
              i === 0 ? 'bg-v-gold/20 text-v-gold' : 'bg-v-charcoal text-v-text-secondary'
            }`}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-v-text-primary truncate">{c.name}</p>
              <p className="text-[10px] text-v-text-secondary truncate">{c.email}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm text-v-gold font-medium">${c.total_revenue.toLocaleString()}</p>
              <p className="text-[10px] text-v-text-secondary">{c.quote_count} quotes</p>
            </div>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
