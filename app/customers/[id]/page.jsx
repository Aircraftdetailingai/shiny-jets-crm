"use client";
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

const ACTIVITY_CONFIG = {
  quote_created: { icon: '+', color: 'bg-v-gold', label: 'Quote', group: 'quotes' },
  quote_sent: { icon: '\u2192', color: 'bg-v-gold', label: 'Sent', group: 'quotes' },
  quote_viewed: { icon: '\u25C9', color: 'bg-v-gold', label: 'Viewed', group: 'quotes' },
  quote_accepted: { icon: '\u2713', color: 'bg-green-500', label: 'Accepted', group: 'quotes' },
  quote_expired: { icon: '\u2717', color: 'bg-gray-500', label: 'Expired', group: 'quotes' },
  payment_received: { icon: '$', color: 'bg-green-500', label: 'Payment', group: 'payments' },
  payment_failed: { icon: '!', color: 'bg-red-500', label: 'Failed', group: 'payments' },
  refund_issued: { icon: '\u21A9', color: 'bg-red-400', label: 'Refund', group: 'payments' },
  job_completed: { icon: '\u2713', color: 'bg-emerald-500', label: 'Completed', group: 'jobs' },
  job_scheduled: { icon: '\uD83D\uDCC5', color: 'bg-v-gold', label: 'Scheduled', group: 'jobs' },
  followup_sent: { icon: '\u2709', color: 'bg-v-gold', label: 'Follow-up', group: 'quotes' },
  note_added: { icon: '\uD83D\uDCDD', color: 'bg-gray-400', label: 'Note', group: 'notes' },
  feedback_received: { icon: '\u2605', color: 'bg-v-gold', label: 'Feedback', group: 'feedback' },
  customer_created: { icon: '\u263A', color: 'bg-v-gold', label: 'Created', group: 'other' },
};

function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id;

  const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'quotes', label: 'Quotes' },
    { key: 'payments', label: 'Invoices' },
    { key: 'jobs', label: 'Jobs' },
    { key: 'notes', label: 'Notes' },
    { key: 'feedback', label: 'Feedback' },
  ];

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
  const [loadError, setLoadError] = useState(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('vector_token') : null;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    loadAll();
  }, [customerId]);

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [custRes, notesRes, actRes] = await Promise.all([
        fetch(`/api/customers/${customerId}`, { headers }),
        fetch(`/api/customers/${customerId}/notes`, { headers }).catch(() => null),
        fetch(`/api/customers/${customerId}/activity`, { headers }).catch(() => null),
      ]);

      if (custRes.ok) {
        const data = await custRes.json();
        setCustomer(data.customer);
        setQuoteStats(data.stats || null);
      } else {
        const err = await custRes.json().catch(() => ({}));
        setLoadError(err.error || `Failed to load customer (${custRes.status})`);
      }
      if (notesRes?.ok) {
        const data = await notesRes.json();
        setNotes(data.notes || []);
      }
      if (actRes?.ok) {
        const data = await actRes.json();
        setActivity(data.activity || []);
      } else if (actRes) {
        console.error('Activity API error:', actRes.status);
      }
    } catch (err) {
      console.error('Load error:', err);
      setLoadError(err.message);
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
    return <LoadingSpinner message="Loading..." />;
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-v-charcoal flex items-center justify-center p-4">
        <div className="bg-v-surface border border-v-border rounded-sm p-8 text-center max-w-sm">
          <p className="text-v-text-secondary mb-4">{loadError || 'Customer not found'}</p>
          <a href="/customers" className="text-v-gold hover:text-v-gold-dim">Back to Customers</a>
        </div>
      </div>
    );
  }

  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  const pinnedNotes = notes.filter(n => n.pinned);

  return (
    <div className="page-transition min-h-screen bg-v-charcoal p-4">
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <a href="/customers" className="text-2xl text-v-text-secondary hover:text-v-gold">&larr;</a>
        <div className="flex-1">
          <h1 className="text-2xl font-heading text-v-text-primary">{customer.name || 'Customer'}</h1>
          <p className="text-sm text-v-text-secondary">{customer.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/quotes/new?customer_id=${customerId}`}
            className="px-4 py-2 bg-v-gold text-black text-sm rounded-sm font-medium hover:bg-v-gold-dim transition-colors"
          >
            New Quote
          </a>
          <a
            href={`/quotes?search=${encodeURIComponent(customer.email)}`}
            className="px-4 py-2 border border-v-border text-v-text-secondary text-sm rounded-sm hover:text-v-text-primary hover:border-v-gold/50 transition-colors"
          >
            View Quotes
          </a>
        </div>
      </header>

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Info Card */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact Info */}
          <div className="bg-v-surface border border-v-border rounded-sm p-5">
            <h2 className="text-sm font-heading text-v-text-secondary uppercase tracking-widest mb-3">Customer</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-v-text-secondary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <a href={`mailto:${customer.email}`} className="text-v-gold hover:text-v-gold-dim">{customer.email}</a>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-v-text-secondary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a href={`tel:${customer.phone}`} className="text-v-gold hover:text-v-gold-dim">{formatPhone(customer.phone)}</a>
                </div>
              )}
              {customer.company_name && (
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-v-text-secondary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span className="text-v-text-primary">{customer.company_name}</span>
                </div>
              )}
            </div>
            {tags.length > 0 && (
              <div className="mt-3 pt-3 border-t border-v-border flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-v-gold/10 text-v-gold border border-v-gold/30">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Aircraft Contact Info */}
          {(customer.poc_name || customer.emergency_contact_name) && (
            <div className="bg-v-surface border border-v-border rounded-sm p-5">
              <h2 className="text-sm font-heading text-v-text-secondary uppercase tracking-widest mb-3">Aircraft Contact</h2>
              {customer.poc_name && (
                <div className="mb-3">
                  <p className="text-sm font-medium text-v-text-primary">{customer.poc_name}</p>
                  {customer.poc_role && <p className="text-xs text-v-text-secondary">{customer.poc_role}</p>}
                  <div className="mt-1 space-y-1">
                    {customer.poc_phone && (
                      <a href={`tel:${customer.poc_phone}`} className="block text-sm text-v-gold hover:text-v-gold-dim">{formatPhone(customer.poc_phone)}</a>
                    )}
                    {customer.poc_email && (
                      <a href={`mailto:${customer.poc_email}`} className="block text-sm text-v-gold hover:text-v-gold-dim">{customer.poc_email}</a>
                    )}
                  </div>
                </div>
              )}
              {customer.emergency_contact_name && (
                <div className="pt-2 border-t border-v-border">
                  <p className="text-xs font-semibold text-v-danger uppercase tracking-wider mb-1">Emergency</p>
                  <p className="text-sm font-medium text-v-text-primary">{customer.emergency_contact_name}</p>
                  {customer.emergency_contact_phone && (
                    <a href={`tel:${customer.emergency_contact_phone}`} className="text-sm text-v-gold hover:text-v-gold-dim">{formatPhone(customer.emergency_contact_phone)}</a>
                  )}
                </div>
              )}
              {customer.contact_notes && (
                <div className="mt-2 pt-2 border-t border-v-border">
                  <p className="text-xs text-v-text-secondary whitespace-pre-wrap">{customer.contact_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Quick Stats */}
          {quoteStats && (
            <div className="bg-v-surface border border-v-border rounded-sm p-5">
              <h2 className="text-sm font-heading text-v-text-secondary uppercase tracking-widest mb-3">Details</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-v-text-secondary">Total Quotes</p>
                  <p className="text-lg font-bold text-v-text-primary font-data">{quoteStats.totalQuotes || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-v-text-secondary">Total Revenue</p>
                  <p className="text-lg font-bold text-v-success font-data">${(quoteStats.totalRevenue || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-v-text-secondary">Completed</p>
                  <p className="text-lg font-bold text-v-success font-data">{quoteStats.completedJobs || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-v-text-secondary">Last Quote</p>
                  <p className="text-sm font-medium text-v-text-primary">{quoteStats.lastService ? formatDate(quoteStats.lastService) : '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Pinned Notes */}
          {pinnedNotes.length > 0 && (
            <div className="bg-v-gold/5 border border-v-gold/20 rounded-sm p-4">
              <h2 className="text-sm font-semibold text-v-gold mb-2 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                Pinned Notes
              </h2>
              <div className="space-y-2">
                {pinnedNotes.map(note => (
                  <div key={note.id} className="text-sm text-v-text-primary bg-v-surface/60 rounded p-2.5">
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
                className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-v-surface text-v-text-primary border border-v-border'
                    : 'text-v-text-secondary hover:text-v-text-primary hover:bg-v-surface/50'
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
                          ? 'bg-v-gold text-v-charcoal'
                          : 'bg-v-surface text-v-text-secondary border border-v-border hover:text-v-text-primary hover:border-v-gold/50'
                      }`}
                    >
                      {f.label}{count > 0 ? ` (${count})` : ''}
                    </button>
                  );
                })}
              </div>

              {/* Timeline */}
              <div className="bg-v-surface border border-v-border rounded-sm">
                {filteredActivity.length === 0 ? (
                  <div className="p-8 text-center text-v-text-secondary text-sm">
                    {activityFilter === 'all'
                      ? 'No activity yet. Events will appear here when you send quotes, receive payments, etc.'
                      : `No ${activityFilter} activity found.`}
                  </div>
                ) : (
                  <div className="p-4">
                    {Object.entries(groupedActivity).map(([date, items]) => (
                      <div key={date} className="mb-6 last:mb-0">
                        <p className="text-xs font-semibold text-v-text-secondary uppercase tracking-wider mb-3 sticky top-0 bg-v-surface z-10 py-1">{date}</p>
                        <div className="relative pl-8 border-l-2 border-v-border space-y-4">
                          {items.map(item => {
                            const config = ACTIVITY_CONFIG[item.type] || { icon: '\u25CF', color: 'bg-gray-400', label: item.type, group: 'other' };
                            const amount = item.details?.amount;
                            return (
                              <div key={item.id} className="relative group">
                                {/* Icon circle */}
                                <div className={`absolute -left-[33px] w-4 h-4 rounded-full ${config.color} ring-3 ring-v-surface flex items-center justify-center`}>
                                  <span className="text-white text-[8px] font-bold leading-none">{config.icon}</span>
                                </div>

                                <div className="bg-v-charcoal/50 rounded px-3 py-2.5 group-hover:bg-v-charcoal transition-colors">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm text-v-text-primary">{item.summary}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-v-text-secondary">{formatTime(item.date)}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${config.color} text-white`}>
                                          {config.label}
                                        </span>
                                      </div>
                                    </div>
                                    {amount && parseFloat(amount) > 0 && (
                                      <span className={`text-sm font-bold font-data whitespace-nowrap ${
                                        item.type === 'refund_issued' ? 'text-v-danger' :
                                        item.type === 'payment_received' ? 'text-v-success' :
                                        'text-v-text-primary'
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
              <div className="bg-v-surface border border-v-border rounded-sm p-4">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note about this customer..."
                  rows={3}
                  className="w-full px-3 py-2 bg-v-charcoal border border-v-border rounded text-sm text-v-text-primary placeholder-v-text-secondary/50 focus:border-v-gold/50 outline-none resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={addNote}
                    disabled={noteSaving || !newNote.trim()}
                    className="px-4 py-2 bg-v-gold text-v-charcoal text-sm rounded-sm hover:bg-v-gold-dim disabled:opacity-50 font-medium"
                  >
                    {noteSaving ? 'Saving...' : 'Add Note'}
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {notes.length === 0 ? (
                <div className="bg-v-surface border border-v-border rounded-sm p-8 text-center text-v-text-secondary text-sm">
                  No notes yet
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map(note => (
                    <div key={note.id} className={`bg-v-surface border rounded-sm p-4 ${note.pinned ? 'border-v-gold/30' : 'border-v-border'}`}>
                      {editingNote === note.id ? (
                        <div>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 bg-v-charcoal border border-v-border rounded text-sm text-v-text-primary outline-none resize-none mb-2"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditingNote(null)} className="px-3 py-1.5 text-sm text-v-text-secondary hover:text-v-text-primary">Cancel</button>
                            <button onClick={saveEdit} className="px-3 py-1.5 text-sm bg-v-gold text-v-charcoal rounded-sm hover:bg-v-gold-dim font-medium">Save</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-v-text-primary whitespace-pre-wrap">{note.content}</p>
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-v-border">
                            <p className="text-xs text-v-text-secondary">
                              {timeAgo(note.created_at)}
                              {note.pinned && <span className="ml-2 text-v-gold font-medium">Pinned</span>}
                            </p>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => togglePin(note)}
                                className={`p-1.5 rounded hover:bg-v-charcoal text-xs ${note.pinned ? 'text-v-gold' : 'text-v-text-secondary'}`}
                                title={note.pinned ? 'Unpin' : 'Pin'}
                              >
                                <svg className="w-4 h-4" fill={note.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => { setEditingNote(note.id); setEditContent(note.content); }}
                                className="p-1.5 rounded hover:bg-v-charcoal text-v-text-secondary text-xs"
                                title="Edit"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => deleteNote(note.id)}
                                className="p-1.5 rounded hover:bg-v-danger/10 text-v-text-secondary hover:text-v-danger text-xs"
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
