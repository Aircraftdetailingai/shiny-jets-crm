'use client';
import { useState, useEffect } from 'react';
import WidgetCard from '../WidgetCard';

export default function StaffingAlerts({ data }) {
  const alerts = data?.staffingAlerts || [];
  const [assigning, setAssigning] = useState(null); // alert id being assigned
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [resolvedIds, setResolvedIds] = useState(new Set());

  // Fetch team members when assigning
  useEffect(() => {
    if (!assigning) return;
    const token = localStorage.getItem('vector_token');
    if (!token) return;
    fetch('/api/team', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setTeamMembers(d.members || d.team || []))
      .catch(() => {});
  }, [assigning]);

  const handleAssign = async (alert) => {
    if (assigning === alert.id) {
      // Confirm assignment
      setSaving(true);
      try {
        const token = localStorage.getItem('vector_token');
        const quoteId = alert.quote_id || alert.quotes?.id;
        await fetch(`/api/jobs/${quoteId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ teamMemberIds: selectedMembers }),
        });
        setResolvedIds(prev => new Set([...prev, alert.id]));
        setAssigning(null);
        setSelectedMembers([]);
      } catch {}
      setSaving(false);
    } else {
      setAssigning(alert.id);
      setSelectedMembers([]);
    }
  };

  const toggleMember = (id) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const visibleAlerts = alerts.filter(a => !resolvedIds.has(a.id));

  return (
    <WidgetCard title="Staffing Alerts" subtitle={visibleAlerts.length > 0 ? `${visibleAlerts.length} job${visibleAlerts.length !== 1 ? 's' : ''} needing staff` : 'No alerts'}>
      <div className="space-y-1 h-full overflow-y-auto">
        {visibleAlerts.length === 0 && (
          <p className="text-v-text-secondary text-sm text-center py-6">No staffing alerts</p>
        )}
        {visibleAlerts.map((alert) => {
          const quote = alert.quotes || {};
          const dateStr = alert.scheduled_date
            ? new Date(alert.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';
          const isAssigning = assigning === alert.id;

          return (
            <div key={alert.id} className="border-b border-v-border-subtle last:border-0">
              <div className="flex items-center gap-3 py-2">
                <div className="w-2 h-2 rounded-full bg-v-gold flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-v-text-primary truncate">
                    {dateStr} — {quote.client_name || 'Customer'}
                  </p>
                  <p className="text-[10px] text-v-text-secondary truncate">
                    {quote.aircraft_model || quote.aircraft_type || 'Detail'}
                  </p>
                </div>
                <button
                  onClick={() => handleAssign(alert)}
                  disabled={saving}
                  className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors flex-shrink-0 ${
                    isAssigning && selectedMembers.length > 0
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-v-gold/20 text-v-gold hover:bg-v-gold/30'
                  }`}
                >
                  {isAssigning && selectedMembers.length > 0 ? 'Confirm' : 'Assign'}
                </button>
              </div>

              {isAssigning && (
                <div className="pb-2 pl-5">
                  {teamMembers.length === 0 ? (
                    <p className="text-[11px] text-v-text-secondary">Loading team...</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {teamMembers.filter(m => m.status === 'active').map(m => (
                        <button
                          key={m.id}
                          onClick={() => toggleMember(m.id)}
                          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                            selectedMembers.includes(m.id)
                              ? 'border-v-gold bg-v-gold/20 text-v-gold'
                              : 'border-v-border text-v-text-secondary hover:border-v-text-secondary'
                          }`}
                        >
                          {m.name || m.email}
                        </button>
                      ))}
                      <button
                        onClick={() => { setAssigning(null); setSelectedMembers([]); }}
                        className="px-2 py-0.5 text-[10px] text-v-text-secondary hover:text-v-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}
