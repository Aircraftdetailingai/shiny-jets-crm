"use client";
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

const ACTION_TYPES = [
  'inventory_update',
  'job_progress',
  'photo_upload',
  'job_start',
  'job_complete',
  'change_order_request',
  'product_usage',
  'note_added',
];

const DOT_COLORS = {
  job_complete: 'bg-green-500',
  job_progress: 'bg-blue-500',
  job_start: 'bg-blue-400',
  inventory_update: 'bg-amber-500',
  photo_upload: 'bg-purple-500',
  change_order_request: 'bg-amber-400',
  product_usage: 'bg-cyan-500',
  note_added: 'bg-gray-400',
};

const BADGE_COLORS = {
  job_complete: 'bg-green-900/30 text-green-400',
  job_progress: 'bg-blue-900/30 text-blue-400',
  job_start: 'bg-blue-900/20 text-blue-300',
  inventory_update: 'bg-amber-900/30 text-amber-400',
  photo_upload: 'bg-purple-900/30 text-purple-400',
  change_order_request: 'bg-amber-900/20 text-amber-300',
  product_usage: 'bg-cyan-900/30 text-cyan-400',
  note_added: 'bg-gray-800/40 text-gray-400',
};

function formatDescription(a) {
  const name = a.member_name || 'Unknown';
  const meta = a.metadata || {};
  const aircraft = meta.aircraft || meta.tail_number || 'aircraft';

  switch (a.action_type) {
    case 'inventory_update':
      return `${name} updated inventory: ${meta.product || 'item'} ${meta.old_value ?? '?'} \u2192 ${meta.new_value ?? '?'} ${meta.unit || ''}`.trim();
    case 'job_progress':
      return `${name} moved ${aircraft} to ${meta.progress ?? '?'}% complete`;
    case 'photo_upload':
      return `${name} uploaded ${meta.count || ''} ${meta.photo_type || ''} photo${(meta.count || 0) !== 1 ? 's' : ''} on ${aircraft}`.replace(/\s+/g, ' ').trim();
    case 'job_start':
      return `${name} started job on ${aircraft}`;
    case 'job_complete':
      return `${name} completed job on ${aircraft}`;
    case 'change_order_request':
      return `${name} requested change order on ${aircraft}`;
    case 'product_usage':
      return `${name} used ${meta.quantity || '?'} ${meta.unit || ''} of ${meta.product || 'product'} on ${aircraft}`.replace(/\s+/g, ' ').trim();
    case 'note_added':
      return `${name} added a note on ${aircraft}`;
    default:
      return `${name} performed ${(a.action_type || 'action').replace(/_/g, ' ')}`;
  }
}

function ActivityItem({ activity }) {
  const dotColor = DOT_COLORS[activity.action_type] || 'bg-gray-500';
  const badgeColor = BADGE_COLORS[activity.action_type] || 'bg-gray-800/40 text-gray-400';
  const label = (activity.action_type || '').replace(/_/g, ' ');

  return (
    <div className="flex items-center gap-3 bg-v-surface border border-v-border rounded-lg px-4 py-3">
      <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${dotColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-v-text-primary truncate">{formatDescription(activity)}</p>
        <p className="text-xs text-v-text-secondary mt-0.5">{timeAgo(activity.created_at)}</p>
      </div>
      <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${badgeColor}`}>
        {label}
      </span>
    </div>
  );
}

export default function CrewActivityPage() {
  const router = useRouter();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ member_id: '', action_type: '', days: 7 });
  const [teamMembers, setTeamMembers] = useState([]);

  const fetchActivities = useCallback(async (token, currentFilter) => {
    try {
      const params = new URLSearchParams();
      if (currentFilter.member_id) params.set('member_id', currentFilter.member_id);
      if (currentFilter.action_type) params.set('action_type', currentFilter.action_type);
      if (currentFilter.days) params.set('days', String(currentFilter.days));
      const qs = params.toString();
      const res = await fetch(`/api/team/activity${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setActivities(data.activities || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }

    fetchActivities(token, filter);

    fetch('/api/team', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTeamMembers(d.members || []))
      .catch(() => {});

    const interval = setInterval(() => {
      const t = localStorage.getItem('vector_token');
      if (t) fetchActivities(t, filter);
    }, 30000);

    return () => clearInterval(interval);
  }, [router, filter, fetchActivities]);

  const updateFilter = (key, value) => {
    setLoading(true);
    setFilter(prev => ({ ...prev, [key]: value }));
  };

  return (
    <AppShell title="Crew Activity">
      <div className="px-6 md:px-10 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push('/team')}
              className="text-sm text-v-text-secondary hover:text-v-gold transition-colors mb-2"
            >
              &larr; Back to Team
            </button>
            <h1 className="font-heading text-[2rem] font-light text-v-text-primary" style={{ letterSpacing: '0.15em' }}>
              CREW ACTIVITY LOG
            </h1>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={filter.member_id}
            onChange={e => updateFilter('member_id', e.target.value)}
            className="bg-v-surface border border-v-border text-v-text-primary text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-v-gold"
          >
            <option value="">All Members</option>
            {teamMembers.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <select
            value={filter.action_type}
            onChange={e => updateFilter('action_type', e.target.value)}
            className="bg-v-surface border border-v-border text-v-text-primary text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-v-gold"
          >
            <option value="">All Actions</option>
            {ACTION_TYPES.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>

          <select
            value={filter.days}
            onChange={e => updateFilter('days', e.target.value)}
            className="bg-v-surface border border-v-border text-v-text-primary text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-v-gold"
          >
            <option value="1">Last 24h</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="">All time</option>
          </select>
        </div>

        {/* Activity feed */}
        {loading ? (
          <div className="text-v-text-secondary text-center py-12">Loading activity...</div>
        ) : activities.length === 0 ? (
          <div className="bg-v-surface border border-v-border rounded-lg p-8 text-center">
            <p className="text-v-text-secondary">No activity found for the selected filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map(a => (
              <ActivityItem key={a.id} activity={a} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
