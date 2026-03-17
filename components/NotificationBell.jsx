"use client";
import { useState, useEffect, useRef, useCallback } from 'react';

const TYPE_ICONS = {
  quote_viewed: '👁',
  payment_received: '💰',
  quote_expired: '⏰',
  job_reminder: '📅',
  job_scheduled: '📅',
  staffing_alert: '🟡',
};

const TYPE_COLORS = {
  quote_viewed: 'text-v-gold',
  payment_received: 'text-green-400',
  quote_expired: 'text-amber-400',
  job_reminder: 'text-purple-400',
  job_scheduled: 'text-blue-400',
  staffing_alert: 'text-yellow-400',
};

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `$${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `$${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `$${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem('vector_token');
      if (!token) return;
      const res = await fetch('/api/notifications?limit=20', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {}
  }, []);

  // Poll every 30s + on mount
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAsRead = async (id) => {
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleClick = (n) => {
    if (!n.read) markAsRead(n.id);
    if (n.link) window.location.href = n.link;
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(prev => !prev); if (!open) fetchNotifications(); }}
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
        aria-label={'Notifications'}
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-v-surface rounded border border-v-border shadow-2xl z-50 max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-v-border">
            <h3 className="text-sm font-medium text-v-text-primary">{'Notifications'}</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-v-gold hover:text-v-gold-dim"
              >
                {'Mark all as read'}
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-v-text-secondary text-sm">
                {'No notifications yet'}
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-v-surface-light transition-colors border-b border-v-border/50 ${
                    !n.read ? 'bg-v-surface-light/50' : ''
                  }`}
                >
                  <span className={`text-lg flex-shrink-0 mt-0.5 ${TYPE_COLORS[n.type] || ''}`}>
                    {TYPE_ICONS[n.type] || '🔔'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${!n.read ? 'text-v-text-primary' : 'text-v-text-secondary'}`}>
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="w-2 h-2 bg-v-gold rounded-full flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-v-text-secondary mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-xs text-v-text-secondary/60 mt-1">{timeAgo(n.created_at, t)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
