'use client';
import WidgetCard from '../WidgetCard';

export default function TopServicesMargin({ data }) {
  const services = data?.topServices || [];
  const maxRev = services.length > 0 ? services[0].revenue : 1;

  return (
    <WidgetCard title="Top Services by Revenue">
      <div className="space-y-2 h-full overflow-y-auto">
        {services.length === 0 && <p className="text-v-text-secondary text-sm text-center py-6">No service data yet</p>}
        {services.map((svc, i) => (
          <div key={svc.name} className="flex items-center gap-3">
            <span className="text-[10px] text-v-text-secondary w-4 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-v-text-primary truncate">{svc.name}</span>
                <span className="text-xs text-v-gold font-medium ml-2">${svc.revenue.toLocaleString()}</span>
              </div>
              <div className="w-full h-1.5 bg-v-charcoal rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(svc.revenue / maxRev) * 100}%`,
                    background: 'linear-gradient(90deg, #007CB1, #A68A3E)',
                  }}
                />
              </div>
            </div>
            <span className="text-[10px] text-v-text-secondary w-8">{svc.count} jobs</span>
          </div>
        ))}
      </div>
    </WidgetCard>
  );
}
