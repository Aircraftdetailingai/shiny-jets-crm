'use client';
import WidgetCard from '../WidgetCard';

export default function LeadsToClose({ data }) {
  const info = data?.leadsToCloseRate || {};
  const rate = info.rate || 0;
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (rate / 100) * circumference;

  return (
    <WidgetCard title="Leads to Close Rate">
      <div className="flex flex-col items-center justify-center h-full">
        <div className="relative w-28 h-28">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(138,155,176,0.1)" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke="#007CB1" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-v-gold text-3xl font-light">{rate}%</span>
          </div>
        </div>
        <p className="text-[10px] text-v-text-secondary mt-3">
          {info.closed || 0} paid of {info.sent || 0} sent
        </p>
      </div>
    </WidgetCard>
  );
}
