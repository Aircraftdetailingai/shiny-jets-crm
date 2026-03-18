'use client';

export const TYPE_CONFIG = {
  quote_sent:        { icon: '✈️', color: 'text-v-gold',      label: 'Quote Sent' },
  quote_viewed:      { icon: '👁',  color: 'text-v-gold',      label: 'Quote Viewed' },
  quote_accepted:    { icon: '✅', color: 'text-green-400',   label: 'Quote Accepted' },
  quote_expired:     { icon: '⏰', color: 'text-v-gold',   label: 'Quote Expired' },
  followup_needed:   { icon: '🔄', color: 'text-orange-400',  label: 'Follow-up Needed' },
  payment_received:  { icon: '💰', color: 'text-green-400',   label: 'Payment Received' },
  invoice_requested: { icon: '📄', color: 'text-blue-400',    label: 'Invoice Requested' },
  job_scheduled:     { icon: '📅', color: 'text-blue-400',    label: 'Job Scheduled' },
  job_reminder:      { icon: '🔔', color: 'text-purple-400',  label: 'Job Reminder' },
  booking_reminder:  { icon: '🔔', color: 'text-purple-400',  label: 'Booking Reminder' },
  staffing_alert:    { icon: '🟡', color: 'text-yellow-400',  label: 'Staffing Alert' },
  system:            { icon: 'ℹ️',  color: 'text-gray-400',    label: 'System' },
};

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationRow({ notification, compact = false, onClick }) {
  const config = TYPE_CONFIG[notification.type] || { icon: '🔔', color: '', label: 'Notification' };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 flex items-start gap-3 hover:bg-v-surface-light transition-colors border-b border-v-border/50 ${
        !notification.read
          ? 'border-l-[3px] border-l-v-gold bg-v-surface-light/30'
          : 'border-l-[3px] border-l-transparent'
      } ${compact ? 'py-3' : 'py-4'}`}
    >
      <span className={`text-lg flex-shrink-0 mt-0.5 ${config.color}`}>
        {config.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium truncate ${!notification.read ? 'text-v-text-primary' : 'text-v-text-secondary'}`}>
            {notification.title}
          </p>
          {!notification.read && compact && (
            <span className="w-1.5 h-1.5 bg-v-gold rounded-full flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-v-text-secondary mt-0.5 line-clamp-2">{notification.message}</p>
      </div>
      <span className="text-[11px] text-v-text-secondary/60 whitespace-nowrap flex-shrink-0 mt-1">
        {timeAgo(notification.created_at)}
      </span>
    </button>
  );
}
