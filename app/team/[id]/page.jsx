"use client";
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function TeamMemberPage() {
  const router = useRouter();
  const params = useParams();
  const [member, setMember] = useState(null);
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState({ total_hours: 0, total_pay: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryForm, setEntryForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hours_worked: '',
    service_type: '',
    notes: '',
  });

  // Availability state
  const [memberAvail, setMemberAvail] = useState(null);
  const [availSaving, setAvailSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchMember(token);
  }, [router, params.id]);

  const fetchMember = async (token) => {
    try {
      const res = await fetch(`/api/team/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setMember(data.member);
      setEntries(data.time_entries || []);
      setStats(data.stats || { total_hours: 0, total_pay: 0 });
      setEditForm(data.member);
      // Fetch availability
      try {
        const availRes = await fetch(`/api/team/${params.id}/availability`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (availRes.ok) {
          const availData = await availRes.json();
          setMemberAvail(availData.availability);
        }
      } catch {}
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/team/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setMember(data);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this team member? This will also remove all their time entries.')) return;
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch(`/api/team/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      router.push('/team');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          team_member_id: params.id,
          ...entryForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setShowAddEntry(false);
      setEntryForm({ date: new Date().toISOString().split('T')[0], hours_worked: '', service_type: '', notes: '' });
      fetchMember(token);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleApprove = async (entryId, action) => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/time-entries/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: [entryId], action }),
      });
      if (res.ok) {
        fetchMember(token);
      }
    } catch {}
  };

  const saveAvailability = async (avail) => {
    setAvailSaving(true);
    try {
      const token = localStorage.getItem('vector_token');
      await fetch(`/api/team/${params.id}/availability`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability: avail }),
      });
      setMemberAvail(avail);
    } catch {}
    setAvailSaving(false);
  };

  const toggleAvailDay = (dayKey) => {
    const avail = memberAvail || { weeklySchedule: {} };
    const ws = { ...(avail.weeklySchedule || {}) };
    if (ws[dayKey]) {
      delete ws[dayKey];
    } else {
      ws[dayKey] = { start: '08:00', end: '17:00' };
    }
    const updated = { ...avail, weeklySchedule: ws };
    setMemberAvail(updated);
    saveAvailability(updated);
  };

  const updateAvailTime = (dayKey, field, value) => {
    const avail = memberAvail || { weeklySchedule: {} };
    const ws = { ...(avail.weeklySchedule || {}) };
    ws[dayKey] = { ...(ws[dayKey] || {}), [field]: value };
    const updated = { ...avail, weeklySchedule: ws };
    setMemberAvail(updated);
    saveAvailability(updated);
  };

  // Calculate weekly/monthly stats
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const weekHours = entries
    .filter(e => new Date(e.date) >= weekStart)
    .reduce((sum, e) => sum + parseFloat(e.hours_worked || 0), 0);

  const monthHours = entries
    .filter(e => new Date(e.date) >= monthStart)
    .reduce((sum, e) => sum + parseFloat(e.hours_worked || 0), 0);

  if (loading) {
    return <LoadingSpinner message={'Loading team...'} />;
  }

  if (error && !member) {
    return (
      <div className="page-transition min-h-screen bg-v-charcoal p-4">
        <header className="flex items-center space-x-3 mb-6">
          <a href="/team" className="text-white text-2xl">&#8592;</a>
          <h1 className="text-2xl font-bold text-white">{'Team'}</h1>
        </header>
        <div className="bg-red-900/200/20 border border-red-500/50 rounded-lg p-4 text-red-200">{error}</div>
      </div>
    );
  }

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <a href="/team" className="text-white text-2xl">&#8592;</a>
          <h1 className="text-2xl font-bold text-white">{member.name}</h1>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            member.type === 'employee' ? 'bg-blue-900/200/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
          }`}>
            {member.type}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm"
            >
              {'Edit'}
            </button>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-v-gold-muted/200 text-white rounded-lg hover:bg-v-gold-dim transition-colors text-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditForm(member); }}
                className="px-3 py-1.5 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm"
              >
                {'Cancel'}
              </button>
            </>
          )}
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 bg-red-900/200/20 text-red-300 rounded-lg hover:bg-red-900/200/30 transition-colors text-sm"
          >
            {'Delete'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-900/200/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm mb-4">{error}</div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Total Hours'}</p>
          <p className="text-white text-xl font-bold">{stats.total_hours.toFixed(1)}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'Total Pay'}</p>
          <p className="text-white text-xl font-bold">${stats.total_pay.toFixed(2)}</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'This Week'}</p>
          <p className="text-white text-xl font-bold">{weekHours.toFixed(1)}h</p>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <p className="text-white/60 text-xs">{'This Month'}</p>
          <p className="text-white text-xl font-bold">{monthHours.toFixed(1)}h</p>
        </div>
      </div>

      {/* Profile Card */}
      <div className="bg-v-surface rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold text-v-text-primary mb-4">Profile</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">{'Name'}</label>
              <input
                type="text"
                value={editForm.name || ''}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">{'Type'}</label>
              <select
                value={editForm.type || 'employee'}
                onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none"
              >
                <option value="employee">{'Employee'}</option>
                <option value="contractor">{'Contractor'}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">{'Email'}</label>
              <input
                type="email"
                value={editForm.email || ''}
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">{'Phone'}</label>
              <input
                type="tel"
                value={editForm.phone || ''}
                onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">Hourly Pay</label>
              <input
                type="number"
                step="0.01"
                value={editForm.hourly_pay || ''}
                onChange={e => setEditForm({ ...editForm, hourly_pay: e.target.value })}
                className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">PIN Code</label>
              <input
                type="text"
                maxLength={6}
                value={editForm.pin_code || ''}
                onChange={e => setEditForm({ ...editForm, pin_code: e.target.value })}
                className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-v-text-secondary mb-1">{'Status'}</label>
              <select
                value={editForm.status || 'active'}
                onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none"
              >
                <option value="active">{'Active'}</option>
                <option value="inactive">{'Inactive'}</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-v-text-secondary">{'Email'}</p>
              <p className="text-v-text-primary">{member.email || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-v-text-secondary">{'Phone'}</p>
              <p className="text-v-text-primary">{member.phone || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-v-text-secondary">Hourly Pay</p>
              <p className="text-v-text-primary">${parseFloat(member.hourly_pay || 0).toFixed(2)}{'/hr'}</p>
            </div>
            <div>
              <p className="text-sm text-v-text-secondary">PIN Code</p>
              <p className="text-v-text-primary">{member.pin_code || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-v-text-secondary">{'Status'}</p>
              <p className="text-v-text-primary capitalize">{member.status}</p>
            </div>
            <div>
              <p className="text-sm text-v-text-secondary">Added</p>
              <p className="text-v-text-primary">{new Date(member.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </div>

      {/* Availability */}
      <div className="bg-v-surface rounded-lg p-5">
        <h2 className="text-lg font-semibold text-v-text-primary mb-4">Availability</h2>
        <p className="text-sm text-v-text-secondary mb-4">Set this team member&apos;s working schedule</p>
        <div className="space-y-2">
          {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((dayName, idx) => {
            const dayKey = String(idx);
            const dayConfig = memberAvail?.weeklySchedule?.[dayKey];
            const isEnabled = dayConfig !== null && dayConfig !== undefined;
            return (
              <div key={idx} className="flex items-center gap-3">
                <div
                  onClick={() => toggleAvailDay(dayKey)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${isEnabled ? 'bg-v-gold' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isEnabled ? 'translate-x-5' : ''}`} />
                </div>
                <span className="w-20 text-sm text-v-text-primary">{dayName}</span>
                {isEnabled && (
                  <div className="flex items-center gap-2">
                    <input type="time" value={dayConfig?.start || '08:00'}
                      onChange={(e) => updateAvailTime(dayKey, 'start', e.target.value)}
                      className="bg-v-charcoal border border-v-border text-v-text-primary rounded px-2 py-1 text-xs" />
                    <span className="text-v-text-secondary text-xs">to</span>
                    <input type="time" value={dayConfig?.end || '17:00'}
                      onChange={(e) => updateAvailTime(dayKey, 'end', e.target.value)}
                      className="bg-v-charcoal border border-v-border text-v-text-primary rounded px-2 py-1 text-xs" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {availSaving && <p className="text-xs text-v-text-secondary mt-2">Saving...</p>}
      </div>

      {/* Time Entries */}
      <div className="bg-v-surface rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-v-text-primary">Time Entries</h2>
          <button
            onClick={() => setShowAddEntry(!showAddEntry)}
            className="px-3 py-1.5 bg-v-gold-muted/200 text-white rounded-lg hover:bg-v-gold-dim transition-colors text-sm font-medium"
          >
            {showAddEntry ? 'Cancel' : '+ Add Entry'}
          </button>
        </div>

        {/* Add Entry Form */}
        {showAddEntry && (
          <form onSubmit={handleAddEntry} className="bg-v-charcoal rounded-lg p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm text-v-text-secondary mb-1">{'Date'}</label>
                <input
                  type="date"
                  value={entryForm.date}
                  onChange={e => setEntryForm({ ...entryForm, date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-v-text-secondary mb-1">{'Hours'}</label>
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  value={entryForm.hours_worked}
                  onChange={e => setEntryForm({ ...entryForm, hours_worked: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm text-v-text-secondary mb-1">Service Type</label>
                <input
                  type="text"
                  value={entryForm.service_type}
                  onChange={e => setEntryForm({ ...entryForm, service_type: e.target.value })}
                  className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none text-sm"
                  placeholder="e.g. Exterior Wash"
                />
              </div>
              <div>
                <label className="block text-sm text-v-text-secondary mb-1">{'Notes'}</label>
                <input
                  type="text"
                  value={entryForm.notes}
                  onChange={e => setEntryForm({ ...entryForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-v-border rounded-lg focus:ring-2 focus:ring-v-gold outline-none text-sm"
                  placeholder={'Optional'}
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-v-gold-muted/200 text-white rounded-lg hover:bg-v-gold-dim transition-colors text-sm font-medium"
            >
              {'Save'}
            </button>
          </form>
        )}

        {entries.length === 0 ? (
          <p className="text-v-text-secondary text-center py-6">No time entries yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-v-text-secondary border-b">
                  <th className="pb-2 font-medium">{'Date'}</th>
                  <th className="pb-2 font-medium">{'Hours'}</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">{'Services'}</th>
                  <th className="pb-2 font-medium hidden md:table-cell">{'Notes'}</th>
                  <th className="pb-2 font-medium">Pay</th>
                  <th className="pb-2 font-medium">{'Approved'}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-v-border text-sm">
                    <td className="py-2.5 text-v-text-primary">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 text-v-text-primary">{parseFloat(entry.hours_worked).toFixed(2)}</td>
                    <td className="py-2.5 text-v-text-secondary hidden sm:table-cell">{entry.service_type || '-'}</td>
                    <td className="py-2.5 text-v-text-secondary hidden md:table-cell">{entry.notes || '-'}</td>
                    <td className="py-2.5 text-v-text-primary">
                      ${(parseFloat(entry.hours_worked) * parseFloat(member.hourly_pay || 0)).toFixed(2)}
                    </td>
                    <td className="py-2.5">
                      {entry.approved ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-900/30 text-green-400">Approved</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleApprove(entry.id, 'approve')} className="px-2 py-0.5 rounded text-xs bg-green-900/30 text-green-400 hover:bg-green-900/50">Approve</button>
                          <button onClick={() => handleApprove(entry.id, 'reject')} className="px-2 py-0.5 rounded text-xs bg-red-900/30 text-red-400 hover:bg-red-900/50">Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
