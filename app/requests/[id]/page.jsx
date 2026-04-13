"use client";
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';

const STATUS_STYLES = {
  new:       { label: 'New', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  opened:    { label: 'Opened', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  viewed:    { label: 'Opened', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  quoted:    { label: 'Quoted', bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' },
  converted: { label: 'Converted', bg: 'bg-v-gold/20', text: 'text-v-gold', border: 'border-v-gold/30' },
  closed:    { label: 'Closed', bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
  declined:  { label: 'Declined', bg: 'bg-red-500/10', text: 'text-red-400/70', border: 'border-red-500/20' },
};

export default function RequestDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineNote, setDeclineNote] = useState('');
  const [sendDeclineEmail, setSendDeclineEmail] = useState(true);
  const [declining, setDeclining] = useState(false);
  const [requestingPhotos, setRequestingPhotos] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }

    // Fetch all leads then find by ID (API returns array)
    const fetchLead = async () => {
      try {
        const res = await fetch('/api/lead-intake/leads', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        const found = (data.leads || []).find(l => l.id === id);
        if (found) {
          setLead(found);
          // Mark as opened if currently new
          if (found.status === 'new') {
            fetch('/api/lead-intake/leads', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'update_status', lead_id: id, status: 'opened' }),
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('Failed to fetch lead:', err);
      }
      setLoading(false);
    };
    fetchLead();
  }, [id, router]);

  const handleDismiss = async () => {
    setDismissing(true);
    const token = localStorage.getItem('vector_token');
    await fetch('/api/lead-intake/leads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', lead_id: id, status: 'closed' }),
    }).catch(() => {});
    router.push('/requests');
  };

  if (loading) return <LoadingSpinner message="Loading request..." />;

  if (!lead) {
    return (
      <AppShell title="Request">
        <div className="px-6 md:px-10 py-16 text-center text-v-text-secondary">Request not found</div>
      </AppShell>
    );
  }

  const style = STATUS_STYLES[lead.status] || STATUS_STYLES.new;
  const notes = (lead.notes || '').split('\n').filter(Boolean);
  const photos = lead.photo_urls || [];
  const handleCreateQuote = () => {
    localStorage.setItem('quote_prefill', JSON.stringify({
      leadId: lead.id,
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      aircraft: lead.aircraft_model || '',
      tail: lead.tail_number || '',
      airport: lead.airport || '',
      service: lead.services_requested || '',
      notes: lead.notes || '',
      photos: lead.photo_urls || [],
      intake_responses: lead.intake_responses || null,
      timestamp: Date.now(),
    }));
    window.location.href = '/quotes/new';
  };

  return (
    <AppShell title="Request Detail">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-[800px]">
        {/* Back */}
        <a href="/requests" className="text-v-text-secondary text-xs hover:text-white mb-6 inline-block">&larr; All Requests</a>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-light text-white">{lead.name || 'Customer'}</h1>
            <p className="text-v-text-secondary text-sm mt-1">
              {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
            </p>
          </div>
          <span className={`px-3 py-1 text-[10px] uppercase tracking-wider rounded ${style.bg} ${style.text} border ${style.border}`}>
            {style.label}
          </span>
        </div>

        {/* Contact Info */}
        <div className="bg-white/[0.03] border border-v-border-subtle rounded-lg p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60 mb-3">Contact</p>
          <div className="space-y-2">
            {lead.email && (
              <div className="flex items-center gap-3">
                <span className="text-v-text-secondary text-xs w-12">Email</span>
                <a href={`mailto:${lead.email}`} className="text-v-gold text-sm hover:underline">{lead.email}</a>
              </div>
            )}
            {lead.phone && (
              <div className="flex items-center gap-3">
                <span className="text-v-text-secondary text-xs w-12">Phone</span>
                <a href={`tel:${lead.phone}`} className="text-v-gold text-sm hover:underline">{lead.phone}</a>
              </div>
            )}
          </div>
        </div>

        {/* Aircraft */}
        <div className="bg-white/[0.03] border border-v-border-subtle rounded-lg p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60 mb-3">Aircraft</p>
          <div className="space-y-2">
            <div className="flex gap-3">
              <span className="text-v-text-secondary text-xs w-16">Aircraft</span>
              <span className="text-white text-sm">{lead.aircraft_model || 'Not specified'}</span>
            </div>
            {lead.tail_number && (
              <div className="flex gap-3">
                <span className="text-v-text-secondary text-xs w-16">Tail</span>
                <span className="text-white text-sm">{lead.tail_number}</span>
              </div>
            )}
            {lead.airport && (
              <div className="flex gap-3">
                <span className="text-v-text-secondary text-xs w-16">Airport</span>
                <span className="text-white text-sm">{lead.airport}</span>
              </div>
            )}
          </div>
        </div>

        {/* Service Request */}
        <div className="bg-white/[0.03] border border-v-border-subtle rounded-lg p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60 mb-3">Service</p>
          {lead.services_requested && (
            <p className="text-white text-sm">{lead.services_requested}</p>
          )}
          {notes.length > 0 && (() => {
            // Extract just area names (before the dash), skip condition descriptions
            const areas = notes.map(n => n.split('\u2014')[0]?.split(' — ')[0]?.trim()).filter(Boolean);
            const uniqueAreas = [...new Set(areas)].filter(a => a.length < 30);
            return uniqueAreas.length > 0 ? (
              <p className="text-v-text-secondary text-xs mt-2">Areas: {uniqueAreas.join(', ')}</p>
            ) : null;
          })()}
        </div>

        {/* Photos */}
        {photos.length > 0 && (
          <div className="bg-white/[0.03] border border-v-border-subtle rounded-lg p-5 mb-4">
            <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60 mb-3">Photos ({photos.length})</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={i}>
                  <img src={typeof p === 'string' ? p : p.url} alt="" className="w-full h-32 object-cover rounded-lg border border-white/10" />
                  {p.caption && <p className="text-v-text-secondary text-[10px] mt-1">{p.caption}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Intake Responses */}
        {lead.intake_responses && Object.keys(lead.intake_responses).length > 0 && (
          <div className="bg-white/[0.03] border border-v-border-subtle rounded-lg p-5 mb-4">
            <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60 mb-3">Intake Responses</p>
            <div className="space-y-2">
              {Object.entries(lead.intake_responses).map(([key, val]) => {
                let label = key;
                if (/^(question|serviceSelect|condition|svc|q)-/i.test(key)) {
                  if (/^serviceSelect/i.test(key)) label = 'Selected services';
                  else if (/^svc/i.test(key)) label = 'Selected services';
                  else if (/^(q-situation|question)/i.test(key)) label = 'Selection';
                  else label = 'Response';
                } else {
                  label = key.replace(/^q_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                }
                return (
                  <div key={key} className="flex gap-3">
                    <span className="text-v-text-secondary text-xs w-32 flex-shrink-0">{label}</span>
                    <span className="text-white text-sm">{Array.isArray(val) ? val.join(', ') : String(val)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3 mt-8">
          <button onClick={handleCreateQuote}
            className="w-full py-4 text-center text-sm font-semibold uppercase tracking-wider bg-v-gold text-v-charcoal hover:bg-v-gold-dim rounded-lg transition-colors">
            Create Quote
          </button>

          <div className="flex gap-3">
            <button onClick={async () => {
              setRequestingPhotos(true);
              const token = localStorage.getItem('vector_token');
              try {
                await fetch('/api/lead-intake/request-photos', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ lead_id: id }),
                });
                setLead(prev => ({ ...prev, status: 'awaiting_photos' }));
              } catch {}
              setRequestingPhotos(false);
            }} disabled={requestingPhotos}
              className="flex-1 py-3 text-xs uppercase tracking-wider text-v-gold border border-v-gold/30 hover:bg-v-gold/5 rounded-lg transition-colors disabled:opacity-50">
              {requestingPhotos ? 'Sending...' : 'Request Photos'}
            </button>

            <button onClick={() => setShowDecline(true)}
              className="flex-1 py-3 text-xs uppercase tracking-wider text-v-text-secondary border border-v-border hover:bg-white/5 rounded-lg transition-colors">
              Decline
            </button>
          </div>

          <button onClick={handleDismiss} disabled={dismissing}
            className="w-full py-2 text-[10px] uppercase tracking-wider text-v-text-secondary/50 hover:text-v-text-secondary transition-colors">
            {dismissing ? '...' : 'Dismiss Request'}
          </button>
        </div>

        {/* Decline Modal */}
        {showDecline && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => !declining && setShowDecline(false)}>
            <div className="bg-v-surface border border-v-border rounded-lg p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="text-white font-medium mb-1">Decline Request</h3>
              <p className="text-v-text-secondary text-xs mb-4">Internal only — the customer receives a generic professional email.</p>

              <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Reason (internal)</label>
              <select value={declineReason} onChange={e => setDeclineReason(e.target.value)}
                className="w-full bg-white/10 border border-white/20 text-white rounded px-3 py-2 text-sm outline-none focus:border-v-gold/50 mb-3" style={{ colorScheme: 'dark' }}>
                <option value="">Select a reason...</option>
                <option value="outside_area">Too far / Outside service area</option>
                <option value="not_available">Not available on requested date</option>
                <option value="aircraft_type">Aircraft type not serviced</option>
                <option value="pricing">Pricing doesn&apos;t work</option>
                <option value="other">Other</option>
              </select>

              <label className="block text-[10px] text-v-text-secondary uppercase tracking-wider mb-1.5">Internal note (optional)</label>
              <textarea value={declineNote} onChange={e => setDeclineNote(e.target.value)}
                placeholder="Optional internal note..."
                rows={2}
                className="w-full bg-white/10 border border-white/20 text-white rounded px-3 py-2 text-sm placeholder-white/30 outline-none focus:border-v-gold/50 resize-none mb-3" />

              <label className="flex items-center gap-2 cursor-pointer mb-5">
                <input type="checkbox" checked={sendDeclineEmail} onChange={e => setSendDeclineEmail(e.target.checked)} className="w-4 h-4 rounded accent-red-500" />
                <span className="text-sm text-white">Send decline email to customer</span>
              </label>

              <div className="flex gap-3">
                <button onClick={async () => {
                  setDeclining(true);
                  const token = localStorage.getItem('vector_token');
                  await fetch('/api/lead-intake/decline', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lead_id: id, reason: declineReason, note: declineNote, send_email: sendDeclineEmail }),
                  }).catch(() => {});
                  router.push('/requests');
                }} disabled={declining}
                  className="flex-1 py-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs uppercase tracking-wider hover:bg-red-500/30 disabled:opacity-50 font-medium">
                  {declining ? 'Processing...' : 'Decline Request'}
                </button>
                <button onClick={() => setShowDecline(false)} disabled={declining}
                  className="flex-1 py-3 border border-v-border text-v-text-secondary rounded-lg text-xs uppercase tracking-wider hover:bg-white/5 disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
