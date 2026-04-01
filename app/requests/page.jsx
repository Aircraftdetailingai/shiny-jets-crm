"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';

const STATUS_STYLES = {
  new:       { label: 'New', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  viewed:    { label: 'Viewed', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  quoted:    { label: 'Quoted', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  converted: { label: 'Converted', bg: 'bg-v-gold/20', text: 'text-v-gold', border: 'border-v-gold/30' },
  closed:    { label: 'Closed', bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30' },
};

export default function RequestsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }

    fetch('/api/lead-intake/leads', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { leads: [] })
      .then(d => setLeads(d.leads || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <LoadingSpinner message="Loading requests..." />;

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter);
  const newCount = leads.filter(l => l.status === 'new').length;

  return (
    <AppShell title="Requests">
      <div className="px-6 md:px-10 py-8 pb-40 max-w-[1200px]">
        <h1 className="font-heading text-[2rem] font-light text-v-text-primary mb-6" style={{ letterSpacing: '0.15em' }}>
          REQUESTS
        </h1>

        {/* Filter tabs */}
        <div className="flex items-center gap-5 mb-6 overflow-x-auto">
          {[
            { key: 'all', label: `All (${leads.length})` },
            { key: 'new', label: `New (${newCount})` },
            { key: 'viewed', label: 'Viewed' },
            { key: 'quoted', label: 'Quoted' },
            { key: 'converted', label: 'Converted' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`text-xs uppercase tracking-[0.15em] pb-2 transition-colors whitespace-nowrap ${
                filter === f.key ? 'text-v-gold border-b border-v-gold' : 'text-v-text-secondary hover:text-white border-b border-transparent'
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-v-text-secondary text-sm">
            <p>{filter === 'all' ? 'No quote requests yet' : `No ${filter} requests`}</p>
            <p className="text-xs mt-2 text-v-text-secondary/60">
              Quote requests from your website widget and direct links will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(lead => {
              const style = STATUS_STYLES[lead.status] || STATUS_STYLES.new;
              return (
                <a key={lead.id} href={`/requests/${lead.id}`}
                  className="block bg-white/[0.02] border border-v-border-subtle rounded-lg px-5 py-4 hover:bg-white/[0.04] transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="text-white text-sm font-medium truncate">{lead.name || lead.customer_name || 'Customer'}</p>
                        <span className={`shrink-0 px-2 py-0.5 text-[9px] uppercase tracking-wider rounded ${style.bg} ${style.text} border ${style.border}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="text-v-text-secondary text-xs truncate">
                        {lead.aircraft_model || 'Aircraft not specified'}
                        {lead.tail_number ? ` \u00B7 ${lead.tail_number}` : ''}
                        {lead.airport ? ` \u00B7 ${lead.airport}` : ''}
                      </p>
                      <p className="text-v-text-secondary/60 text-xs mt-1 truncate">
                        {lead.services_requested || ''}
                        {lead.notes ? ` \u2014 ${lead.notes.split('\n')[0]}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4 shrink-0">
                      <p className="text-v-text-secondary text-[10px]">{lead.created_at ? new Date(lead.created_at).toLocaleDateString() : ''}</p>
                      <span className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-v-gold border border-v-gold/30 rounded">View</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
