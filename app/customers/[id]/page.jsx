"use client";
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

const ACTIVITY_CONFIG = {
  quote_created: { icon: '+', color: 'bg-blue-500', label: 'Quote Created', group: 'quotes' },
  quote_sent: { icon: '\u2192', color: 'bg-indigo-500', label: 'Quote Sent', group: 'quotes' },
  quote_viewed: { icon: '\u25C9', color: 'bg-purple-500', label: 'Quote Viewed', group: 'quotes' },
  quote_expired: { icon: '\u2717', color: 'bg-gray-500', label: 'Quote Expired', group: 'quotes' },
  payment_received: { icon: '$', color: 'bg-green-500', label: 'Payment', group: 'payments' },
  payment_failed: { icon: '!', color: 'bg-red-500', label: 'Payment Failed', group: 'payments' },
  refund_issued: { icon: '\u21A9', color: 'bg-red-400', label: 'Refund', group: 'payments' },
  job_completed: { icon: '\u2713', color: 'bg-emerald-500', label: 'Job Done', group: 'jobs' },
  job_scheduled: { icon: '\uD83D\uDCC5', color: 'bg-amber-500', label: 'Scheduled', group: 'jobs' },
  invoice_created: { icon: '#', color: 'bg-blue-400', label: 'Invoice', group: 'payments' },
  invoice_emailed: { icon: '\u2709', color: 'bg-blue-300', label: 'Invoice Sent', group: 'payments' },
  note_added: { icon: '\uD83D\uDCDD', color: 'bg-gray-400', label: 'Note', group: 'notes' },
  feedback_received: { icon: '\u2605', color: 'bg-amber-400', label: 'Feedback', group: 'feedback' },
  customer_created: { icon: '\u263A', color: 'bg-teal-500', label: 'Created', group: 'other' },
};

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'payments', label: 'Payments' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'notes', label: 'Notes' },
  { key: 'feedback', label: 'Feedback' },
];

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id;

  const [customer, setCustomer] = useState(null);
  const [notes, setNotes] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('activity');
  const [activityFilter, setActivityFilter] = useState('all');
  const [newNote, setNewNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [quoteStats, setQuoteStats] = useState(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    loadAll();
  }, [customerId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [custRes, notesRes, actRes] = await Promise.all([
        fetch(`/api/customers/${customerId}`, { headers }),
        fetch(`/api/customers/${customerId}/notes`, { headers }),
        fetch(`/api/customers/${customerId}/activity`, { headers }),
      ]);

      if (custRes.ok) {
        const data = await custRes.json();
        setCustomer(data.customer);
        setQuoteStats(data.stats || null);
      }
      if (notesRes.ok) {
        const data = await notesRes.json();
        setNotes(data.notes || []);
      }
      if (actRes.ok) {
        const data = await actRes.json();
        setActivity(data.activity || []);
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: newNote }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => [data.note, ...prev]);
        setNewNote('');
      }
    } catch (err) {
      console.error('Add note error:', err);
    } finally {
      setNoteSaving(false);
    }
  };

  const togglePin = async (note) => {
    try {
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ note_id: note.id, pinned: !note.pinned }),
      });
      if (res.ok) {
        setNotes(prev => {
          const updated = prev.map(n => n.id === note.id ? { ...n, pinned: !n.pinned } : n);
          return updated.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.created_at) - new Date(a.created_at);
          });
        });
      }
    } catch (err) {
      console.error('Pin error:', err);
    }
  };

  const saveEdit = async () => {
    if (!editContent.trim() || !editingNote) return;
    try {
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ note_id: editingNote, content: editContent }),
      });
      if (res.ok) {
        setNotes(prev => prev.map(n => n.id === editingNote ? { ...n, content: editContent.trim() } : n));
        setEditingNote(null);
        setEditContent('');
      }
    } catch (err) {
      console.error('Edit error:', err);
    }
  };

  const deleteNote = async (noteId) => {
    if (!confirm('Delete this note?')) return;
    try {
      const res = await fetch(`/api/customers/${customerId}/notes?note_id=${noteId}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
  };

  // Filter + group activity by date
  const filteredActivity = useMemo(() => {
    if (activityFilter === 'all') return activity;
    return activity.filter(item => {
      const config = ACTIVITY_CONFIG[item.type];
      return config && config.group === activityFilter;
    });
  }, [activity, activityFilter]);

  const groupedActivity = useMemo(() => {
    return filteredActivity.reduce((acc, item) => {
      const date = formatDate(item.date);
      if (!acc[date]) acc[date] = [];
      acc[date].push(item);
      return acc;
    }, {});
  }, [filteredActivity]);

  // Count events per filter group
  const filterCounts = useMemo(() => {
    const counts = { all: activity.length, quotes: 0, payments: 0, jobs: 0, notes: 0, feedback: 0, other: 0 };
    for (const item of activity) {
      const config = ACTIVITY_CONFIG[item.type];
      if (config && counts[config.group] !== undefined) {
        counts[config.group]++;
      }
    }
    return counts;
  }, [activity]);

  if (loading) {
    return <LoadingSpinner message="Loading customer..." />;
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 text-center max-w-sm">
          <p className="text-gray-500 mb-4">Customer not found</p>
          <a href="/customers" className="text-amber-600 hover:underline">Back to customers</a>
        </div>
      </div>
    );
  }

  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  const pinnedNotes = notes.filter(n => n.pinned);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <header className="flex items-center gap-4 mb-6 text-white">
        <a href="/customers" className="text-2xl hover:text-amber-400">&larr;</a>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{customer.name || 'Customer'}</h1>
          <p className="text-sm text-white/60">{customer.email}</p>
        </div>
        <a
          href={`/quotes?search=${encodeURIComponent(customer.email)}`}
          className="px-4 py-2 bg-white/10 text-white text-sm rounded-lg hover:bg-white/20"
        >
          View Quotes
        </a>
      </header>

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Info Card */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact Info */}
          <div className="bg-white rounded-lg shadow p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Contact</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 w-5 text-center">&lt;@&gt;</span>
                <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">{customer.email}</a>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 w-5 text-center">#</span>
                  <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">{customer.phone}</a>
                </div>
              )}
              {customer.company_name && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 w-5 text-center">B</span>
                  <span className="text-gray-700">{customer.company_name}</span>
                </div>
              )}
            </div>
            {tags.length > 0 && (
              <div className="mt-3 pt-3 border-t flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Aircraft Contact Info */}
          {(customer.poc_name || customer.emergency_contact_name) && (
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Aircraft Contact</h2>
              {customer.poc_name && (
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-900">{customer.poc_name}</p>
                  {customer.poc_role && <p className="text-xs text-gray-500">{customer.poc_role}</p>}
                  <div className="mt-1 space-y-1">
                    {customer.poc_phone && (
                      <a href={`tel:${customer.poc_phone}`} className="block text-sm text-blue-600 hover:underline">{customer.poc_phone}</a>
                    )}
                    {customer.poc_email && (
                      <a href={`mailto:${customer.poc_email}`} className="block text-sm text-blue-600 hover:underline">{customer.poc_email}</a>
                    )}
                  </div>
                </div>
              )}
              {customer.emergency_contact_name && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1">Emergency</p>
                  <p className="text-sm font-medium text-gray-900">{customer.emergency_contact_name}</p>
                  {customer.emergency_contact_phone && (
                    <a href={`tel:${customer.emergency_contact_phone}`} className="text-sm text-blue-600 hover:underline">{customer.emergency_contact_phone}</a>
                  )}
                </div>
              )}
              {customer.contact_notes && (
                <div className="mt-2 pt-2 border-t">
                  <p className="text-xs text-gray-500 whitespace-pre-wrap">{customer.contact_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Quick Stats */}
          {quoteStats && (
            <div className="bg-white rounded-lg shadow p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Stats</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Total Quotes</p>
                  <p className="text-lg font-bold text-gray-900">{quoteStats.totalQuotes || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Revenue</p>
                  <p className="text-lg font-bold text-green-600">${(quoteStats.totalRevenue || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Completed</p>
                  <p className="text-lg font-bold text-emerald-600">{quoteStats.completedJobs || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Last Service</p>
                  <p className="text-sm font-medium text-gray-700">{quoteStats.lastService ? formatDate(quoteStats.lastService) : '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
                </svg>
                Pinned Notes
              </h2>
              <div className="space-y-2">
                {pinnedNotes.map(note => (
                  <div key={note.id} className="text-sm text-amber-900 bg-white/60 rounded p-2.5">
                    {note.content}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Tabs (Activity / Notes) */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            {['activity', 'notes'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-gray-900 shadow'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab === 'activity' ? `Timeline (${activity.length})` : `Notes (${notes.length})`}
              </button>
            ))}
          </div>

          {/* Activity Timeline */}
          {activeTab === 'activity' && (
            <div className="space-y-3">
              {/* Filter bar */}
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {FILTER_TABS.map(f => {
                  const count = filterCounts[f.key] || 0;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setActivityFilter(f.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                        activityFilter === f.key
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-white/90 text-gray-600 hover:bg-white'
                      }`}
                    >
                      {f.label}{count > 0 ? ` (${count})` : ''}
                    </button>
                  );
                })}
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-lg shadow">
                {filteredActivity.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    {activityFilter === 'all'
                      ? 'No activity yet. Events will appear here when you send quotes, receive payments, etc.'
                      : `No ${activityFilter} activity found.`}
                  </div>
                ) : (
                  <div className="p-4">
                    {Object.entries(groupedActivity).map(([date, items]) => (
                      <div key={date} className="mb-6 last:mb-0">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 sticky top-0 bg-white z-10 py-1">{date}</p>
                        <div className="relative pl-8 border-l-2 border-gray-100 space-y-4">
                          {items.map(item => {
                            const config = ACTIVITY_CONFIG[item.type] || { icon: '\u25CF', color: 'bg-gray-400', label: item.type, group: 'other' };
                            const amount = item.details?.amount;
                            return (
                              <div key={item.id} className="relative group">
                                {/* Icon circle */}
                                <div className={`absolute -left-[33px] w-4 h-4 rounded-full ${config.color} ring-3 ring-white flex items-center justify-center`}>
                                  <span className="text-white text-[8px] font-bold leading-none">{config.icon}</span>
                                </div>

                                <div className="bg-gray-50 rounded-lg px-3 py-2.5 group-hover:bg-gray-100 transition-colors">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-gray-800">{item.summary}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-gray-400">{formatTime(item.date)}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.color} text-white`}>
                                          {config.label}
                                        </span>
                                      </div>
                                    </div>
                                    {amount && parseFloat(amount) > 0 && (
                                      <span className={`text-sm font-bold whitespace-nowrap ${
                                        item.type === 'refund_issued' ? 'text-red-500' :
                                        item.type === 'payment_received' ? 'text-green-600' :
                                        'text-gray-600'
                                      }`}>
                                        {item.type === 'refund_issued' ? '-' : ''}${Number(amount).toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              {/* Add note */}
              <div className="bg-white rounded-lg shadow p-4">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note about this customer..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={addNote}
                    disabled={noteSaving || !newNote.trim()}
                    className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium"
                  >
                    {noteSaving ? 'Saving...' : 'Add Note'}
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {notes.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400 text-sm">
                  No notes yet. Add one above to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map(note => (
                    <div key={note.id} className={`bg-white rounded-lg shadow p-4 ${note.pinned ? 'ring-2 ring-amber-300' : ''}`}>
                      {editingNote === note.id ? (
                        <div>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 outline-none resize-none mb-2"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingNote(null)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            <button onClick={saveEdit} className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">Save</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                            <p className="text-xs text-gray-400">
                              {timeAgo(note.created_at)}
                              {note.pinned && <span className="ml-2 text-amber-500 font-medium">Pinned</span>}
                            </p>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => togglePin(note)}
                                className={`p-1.5 rounded hover:bg-gray-100 text-xs ${note.pinned ? 'text-amber-500' : 'text-gray-400'}`}
                                title={note.pinned ? 'Unpin' : 'Pin'}
                              >
                                <svg className="w-4 h-4" fill={note.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => { setEditingNote(note.id); setEditContent(note.content); }}
                                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 text-xs"
                                title="Edit"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => deleteNote(note.id)}
                                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 text-xs"
                                title="Delete"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
