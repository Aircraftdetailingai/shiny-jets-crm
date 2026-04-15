"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

const STATUS_COLORS = {
  completed: 'bg-green-50 text-green-700', paid: 'bg-green-50 text-green-700',
  scheduled: 'bg-purple-50 text-purple-600', in_progress: 'bg-amber-50 text-amber-600',
};

export default function SharedAircraftPage() {
  const params = useParams();
  const tail = decodeURIComponent(params.tail);
  const shareToken = params.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/portal/aircraft/${encodeURIComponent(tail)}/share/view?token=${shareToken}`)
      .then(r => r.ok ? r.json() : Promise.reject('Not found'))
      .then(d => setData(d))
      .catch(() => setError('This share link is invalid or has been revoked.'))
      .finally(() => setLoading(false));
  }, [tail, shareToken]);

  if (loading) return <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center"><div className="text-center"><p className="text-[#666] text-lg mb-2">{error}</p><a href="/portal/login" className="text-[#007CB1] text-sm hover:underline">Sign in to your portal</a></div></div>;
  if (!data) return null;

  const { aircraft, services, photos, stats, owner_name } = data;

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="bg-[#007CB1] text-white text-center py-2 text-sm">
        Shared by {owner_name || 'Aircraft Owner'} via Shiny Jets
      </div>
      <header className="bg-white border-b border-[#e5e7eb] px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-[#0D1B2A]">{tail}</h1>
          {aircraft.nickname && <p className="text-[#007CB1] text-sm">&ldquo;{aircraft.nickname}&rdquo;</p>}
          <p className="text-[#666] text-sm">{[aircraft.manufacturer, aircraft.model].filter(Boolean).join(' ')}</p>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { val: stats.total_services, label: 'Total Services' },
            { val: `$${stats.total_spent?.toLocaleString() || '0'}`, label: 'Total Spent' },
            { val: stats.days_since_last_service ?? '\u2014', label: 'Days Since Service' },
            { val: (photos || []).length, label: 'Photos' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e5e7eb] p-4 text-center">
              <p className="text-2xl font-bold text-[#0D1B2A]">{s.val}</p>
              <p className="text-xs text-[#999]">{s.label}</p>
            </div>
          ))}
        </div>

        {(photos || []).length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Service Photos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {photos.slice(0, 16).map(p => (
                <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-[#eee]">
                  <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Service History</h2>
          <div className="space-y-2">
            {services.map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#0D1B2A] text-sm">{s.aircraft || 'Service'}</p>
                  <p className="text-xs text-[#999]">{s.scheduled_date || s.created_at?.split('T')[0]}{s.airport ? ` \u00B7 ${s.airport}` : ''}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status?.replace('_', ' ')}</span>
                  {s.total_price > 0 && <p className="text-xs text-[#666] mt-1">${parseFloat(s.total_price).toLocaleString()}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-center py-6">
          <p className="text-[#ccc] text-xs">Powered by Shiny Jets Aviation</p>
          <a href="/portal/login" className="text-[#007CB1] text-xs hover:underline mt-1 inline-block">Create your own free aircraft portal</a>
        </footer>
      </main>
    </div>
  );
}
