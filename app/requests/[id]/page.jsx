"use client";
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';

const STATUS_STYLES = {
  new:       { label: 'New', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  viewed:    { label: 'Viewed', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  quoted:    { label: 'Quoted', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  converted: { label: 'Converted', bg: 'bg-v-gold/20', text: 'text-v-gold', border: 'border-v-gold/30' },
  closed:    { label: 'Closed', bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
};

export default function RequestDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }

    // Fetch lead detail
    fetch(`/api/lead-intake/leads?id=${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const found = data.leads?.find(l => l.id === id) || data.lead;
        setLead(found);

        // Mark as viewed if currently new
        if (found?.status === 'new') {
          fetch('/api/lead-intake/leads', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_status', lead_id: id, status: 'viewed' }),
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
  const quoteUrl = `/quotes/new?lead=${lead.id}&name=${encodeURIComponent(lead.name || '')}&email=${encodeURIComponent(lead.email || '')}&phone=${encodeURIComponent(lead.phone || '')}&aircraft=${encodeURIComponent(lead.aircraft_model || '')}&tail=${encodeURIComponent(lead.tail_number || '')}&airport=${encodeURIComponent(lead.airport || '')}`;

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
          <p className="text-[10px] uppercase tracking-wider text-v-text-secondary/60 mb-3">Service Request</p>
          {lead.services_requested && (
            <p className="text-white text-sm mb-3">{lead.services_requested}</p>
          )}
          {notes.length > 0 && (
            <div className="space-y-1.5 mt-2">
              {notes.map((note, i) => (
                <p key={i} className="text-v-text-secondary text-sm">{note}</p>
              ))}
            </div>
          )}
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

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <a href={quoteUrl}
            className="flex-1 py-4 text-center text-sm font-semibold uppercase tracking-wider bg-v-gold text-v-charcoal hover:bg-v-gold-dim rounded-lg transition-colors">
            Create Quote
          </a>
          <button onClick={handleDismiss} disabled={dismissing}
            className="px-6 py-4 text-sm uppercase tracking-wider text-v-text-secondary border border-v-border hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50">
            {dismissing ? '...' : 'Dismiss'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
