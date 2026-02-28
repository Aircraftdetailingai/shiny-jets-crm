"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const SEGMENTS = [
  { value: 'all', label: 'All Customers', desc: 'Every customer with an email' },
  { value: 'paid', label: 'Paid Customers', desc: 'Customers who have paid' },
  { value: 'pending', label: 'Pending Quotes', desc: 'Customers with open quotes' },
  { value: 'repeat', label: 'Repeat Customers', desc: 'Customers with 2+ quotes' },
];

const TEMPLATES = [
  { value: 'promotional', label: 'Promotional', color: 'bg-amber-100 text-amber-700', desc: 'Sales, discounts, new services' },
  { value: 'seasonal', label: 'Seasonal', color: 'bg-green-100 text-green-700', desc: 'Holiday, seasonal offers' },
  { value: 'follow-up', label: 'Follow-Up', color: 'bg-blue-100 text-blue-700', desc: 'Check-ins, re-engagement' },
  { value: 'newsletter', label: 'Newsletter', color: 'bg-purple-100 text-purple-700', desc: 'Updates, tips, news' },
];

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  sending: 'bg-amber-100 text-amber-700',
};

const TEMPLATE_STARTERS = {
  promotional: `Hi there,

We're excited to offer you an exclusive deal on our aircraft detailing services!

For a limited time, get 10% off your next full detail. Whether it's a comprehensive exterior wash, ceramic coating, or complete interior refresh — we've got you covered.

Book your appointment today and keep your aircraft looking its best.`,
  seasonal: `Hi there,

As the season changes, it's the perfect time to give your aircraft some extra care.

Schedule a seasonal detail to protect against the elements and keep your aircraft in pristine condition. Our team specializes in thorough exterior protection and interior preservation.

Don't wait — book your seasonal service today!`,
  'follow-up': `Hi there,

It's been a while since your last detail, and we wanted to check in!

Regular detailing keeps your aircraft looking sharp and protects your investment. We'd love to help you maintain that showroom finish.

Ready to schedule your next appointment? We're here when you need us.`,
  newsletter: `Hi there,

Here's what's new at our detailing shop:

• We've added new ceramic coating options for enhanced protection
• Seasonal scheduling is now open — book early for best availability
• Tips: Regular wash cycles extend the life of protective coatings

Thank you for being a valued customer. We look forward to working with you again soon!`,
};

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatShortDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MarketingPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [sending, setSending] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create form
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formTemplate, setFormTemplate] = useState('promotional');
  const [formContent, setFormContent] = useState(TEMPLATE_STARTERS.promotional);
  const [formSegment, setFormSegment] = useState('all');
  const [formSchedule, setFormSchedule] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    fetchCampaigns();
  }, [router]);

  const getToken = () => localStorage.getItem('vector_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

  async function fetchCampaigns() {
    try {
      const res = await fetch('/api/marketing', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setFormName('');
    setFormSubject('');
    setFormTemplate('promotional');
    setFormContent(TEMPLATE_STARTERS.promotional);
    setFormSegment('all');
    setFormSchedule('');
    setError('');
    setShowCreate(true);
  }

  function handleTemplateChange(type) {
    setFormTemplate(type);
    // Only replace content if it matches a starter or is empty
    const isStarter = Object.values(TEMPLATE_STARTERS).includes(formContent) || !formContent.trim();
    if (isStarter) {
      setFormContent(TEMPLATE_STARTERS[type] || '');
    }
  }

  async function createCampaign() {
    if (!formName || !formSubject || !formContent) {
      setError('Name, subject, and content are required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/marketing', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          name: formName,
          subject: formSubject,
          template_type: formTemplate,
          content: formContent,
          segment: formSegment,
          scheduled_at: formSchedule ? new Date(formSchedule).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setShowCreate(false);
      setSuccess('Campaign created');
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function sendCampaign(campaign) {
    if (campaign.status === 'sent') return;
    if (!confirm(`Send "${campaign.name}" to ${campaign.recipient_count || 'All'} recipients now?`)) return;
    setSending(campaign.id);
    setError('');
    try {
      const res = await fetch('/api/marketing/send', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setSuccess(`Campaign sent to ${data.sent} of ${data.total} recipients`);
      fetchCampaigns();
      if (showDetail?.id === campaign.id) {
        setShowDetail({ ...showDetail, status: 'sent', sent_count: data.sent });
      }
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(null);
    }
  }

  async function deleteCampaign(campaign) {
    if (!confirm('Delete this campaign?')) return;
    try {
      const res = await fetch(`/api/marketing/${campaign.id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setSuccess('Campaign deleted');
      if (showDetail?.id === campaign.id) setShowDetail(null);
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  async function duplicateCampaign(campaign) {
    try {
      const res = await fetch('/api/marketing', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          name: `${campaign.name} (Copy)`,
          subject: campaign.subject,
          template_type: campaign.template_type,
          content: campaign.content,
          segment: campaign.segment,
        }),
      });
      if (!res.ok) throw new Error('Failed to duplicate');
      setSuccess('Campaign duplicated');
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = filter === 'all' ? campaigns : campaigns.filter(c => c.status === filter);

  const stats = {
    total: campaigns.length,
    sent: campaigns.filter(c => c.status === 'sent').length,
    drafts: campaigns.filter(c => c.status === 'draft').length,
    scheduled: campaigns.filter(c => c.status === 'scheduled').length,
    totalSent: campaigns.reduce((s, c) => s + (c.sent_count || 0), 0),
  };

  if (loading) {
    return (
      <div className="page-transition min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-white text-2xl hover:opacity-70">&larr;</a>
          <h1 className="text-2xl font-bold text-white">{'Email Marketing'}</h1>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:opacity-90 shadow"
        >
          {'+ New Campaign'}
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">{success}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{'Total Campaigns'}</p>
          <p className="text-xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{'Sent'}</p>
          <p className="text-xl font-bold text-green-600">{stats.sent}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{'Drafts'}</p>
          <p className="text-xl font-bold text-gray-600">{stats.drafts}</p>
        </div>
        <div className="bg-white rounded-lg p-3 shadow">
          <p className="text-gray-500 text-xs">{'Total Emails Sent'}</p>
          <p className="text-xl font-bold text-blue-600">{stats.totalSent}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['all', 'draft', 'scheduled', 'sent'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f ? 'bg-amber-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {f === 'all' ? 'All' : f === 'draft' ? 'Draft' : f === 'scheduled' ? 'Scheduled' : 'Sent'}
          </button>
        ))}
      </div>

      {/* Campaign List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg p-8 text-center shadow">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-500 mb-2">{'No campaigns yet'}</p>
          <button onClick={openCreateModal} className="text-amber-600 hover:text-amber-700 font-medium text-sm">
            {'Create your first campaign'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div
              key={c.id}
              className="bg-white rounded-lg p-4 shadow hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setShowDetail(c)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900">{c.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] || STATUS_COLORS.draft}`}>
                      {c.status || 'draft'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      TEMPLATES.find(t => t.value === c.template_type)?.color || 'bg-gray-100 text-gray-600'
                    }`}>
                      {c.template_type || 'promotional'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{c.subject}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {SEGMENTS.find(s => s.value === c.segment)?.label || 'All'}
                    {c.recipient_count ? ` · ${c.recipient_count} ${'recipients'}` : ''}
                    {c.sent_count ? ` · ${c.sent_count} ${'sent'}` : ''}
                    {' · '}{formatShortDate(c.created_at)}
                    {c.scheduled_at && c.status === 'scheduled' ? ` · ${'Scheduled'}: ${formatDate(c.scheduled_at)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {c.status !== 'sent' && (
                    <button
                      onClick={e => { e.stopPropagation(); sendCampaign(c); }}
                      disabled={sending === c.id}
                      title={'Send Now'}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                    >
                      {sending === c.id ? (
                        <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); duplicateCampaign(c); }}
                    title={'Duplicate'}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteCampaign(c); }}
                    title={'Delete'}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">{'+ New Campaign'}</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <div className="space-y-4">
              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'Campaign Name'}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Spring Detailing Special"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>

              {/* Template Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'Template Type'}</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map(tmpl => (
                    <button
                      key={tmpl.value}
                      type="button"
                      onClick={() => handleTemplateChange(tmpl.value)}
                      className={`p-2 rounded-lg text-left border transition ${
                        formTemplate === tmpl.value
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tmpl.color}`}>{tmpl.label}</span>
                      <p className="text-xs text-gray-500 mt-1">{tmpl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Audience Segment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'Audience'}</label>
                <div className="grid grid-cols-2 gap-2">
                  {SEGMENTS.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setFormSegment(s.value)}
                      className={`p-2 rounded-lg text-left border transition ${
                        formSegment === s.value
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-900">{s.label}</p>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'Email Subject'}</label>
                <input
                  type="text"
                  value={formSubject}
                  onChange={e => setFormSubject(e.target.value)}
                  placeholder="e.g. Exclusive 10% Off Your Next Detail!"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'Email Content'}</label>
                <textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  rows={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{'Your company info and unsubscribe link will be added automatically.'}</p>
              </div>

              {/* Schedule */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{'Schedule Send (optional)'}</label>
                <input
                  type="datetime-local"
                  value={formSchedule}
                  onChange={e => setFormSchedule(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">{'Leave empty to save as draft and send manually.'}</p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50 text-sm">
                {'Cancel'}
              </button>
              <button
                onClick={createCampaign}
                disabled={creating || !formName || !formSubject || !formContent}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50 text-sm"
              >
                {creating ? 'Creating...' : formSchedule ? 'Schedule Campaign' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowDetail(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{showDetail.name}</h2>
                <p className="text-sm text-gray-500">{formatDate(showDetail.created_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[showDetail.status] || STATUS_COLORS.draft}`}>
                  {(showDetail.status || 'draft').toUpperCase()}
                </span>
                <button onClick={() => setShowDetail(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-20">{'Type'}:</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  TEMPLATES.find(tmpl => tmpl.value === showDetail.template_type)?.color || 'bg-gray-100 text-gray-600'
                }`}>
                  {showDetail.template_type || 'promotional'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-20">{'Audience'}:</span>
                <span className="text-sm font-medium text-gray-900">
                  {SEGMENTS.find(s => s.value === showDetail.segment)?.label || 'All Customers'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 w-20">{'Subject'}:</span>
                <span className="text-sm font-medium text-gray-900">{showDetail.subject}</span>
              </div>
              {showDetail.recipient_count > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 w-20">{'recipients'}:</span>
                  <span className="text-sm text-gray-900">{showDetail.recipient_count}</span>
                </div>
              )}
              {showDetail.sent_count > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 w-20">{'Sent'}:</span>
                  <span className="text-sm text-green-600 font-medium">{showDetail.sent_count}</span>
                </div>
              )}
              {showDetail.sent_at && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 w-20">{'Sent at'}:</span>
                  <span className="text-sm text-gray-900">{formatDate(showDetail.sent_at)}</span>
                </div>
              )}
              {showDetail.scheduled_at && showDetail.status === 'scheduled' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 w-20">{'Scheduled'}:</span>
                  <span className="text-sm text-blue-600 font-medium">{formatDate(showDetail.scheduled_at)}</span>
                </div>
              )}
            </div>

            {/* Content Preview */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-400 uppercase mb-2">{'Email Preview'}</p>
              <div className="text-sm text-gray-700 whitespace-pre-line">{showDetail.content}</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {showDetail.status !== 'sent' && (
                <button
                  onClick={() => sendCampaign(showDetail)}
                  disabled={sending === showDetail.id}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {sending === showDetail.id ? 'Sending...' : 'Send Now'}
                </button>
              )}
              <button
                onClick={() => duplicateCampaign(showDetail)}
                className="flex-1 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100"
              >
                {'Duplicate'}
              </button>
              <button
                onClick={() => { deleteCampaign(showDetail); }}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100"
              >
                {'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
