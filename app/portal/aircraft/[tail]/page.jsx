"use client";
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-50 text-blue-600',
  viewed: 'bg-blue-50 text-blue-600',
  accepted: 'bg-green-50 text-green-600',
  paid: 'bg-green-50 text-green-700',
  scheduled: 'bg-purple-50 text-purple-600',
  in_progress: 'bg-amber-50 text-amber-600',
  completed: 'bg-green-50 text-green-700',
};

export default function AircraftDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tail = decodeURIComponent(params.tail);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoTab, setPhotoTab] = useState('all');
  const [shareUrl, setShareUrl] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/aircraft/${encodeURIComponent(tail)}`)
      .then(r => {
        if (r.status === 401) { router.push('/portal/login'); return null; }
        return r.json();
      })
      .then(d => { if (d) setData(d); })
      .catch(() => router.push('/portal'))
      .finally(() => setLoading(false));
  }, [tail, router]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { aircraft, services, photos, standing_notes, stats } = data;
  const beforePhotos = photos.filter(p => p.media_type?.startsWith('before'));
  const afterPhotos = photos.filter(p => p.media_type?.startsWith('after'));
  const filteredPhotos = photoTab === 'before' ? beforePhotos : photoTab === 'after' ? afterPhotos : photos;

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e7eb] px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <button onClick={() => router.push('/portal')} className="text-[#007CB1] text-sm hover:underline mb-2 inline-block">
            &larr; Back to portal
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#0D1B2A]">{tail}</h1>
              {aircraft.nickname && <p className="text-[#007CB1] text-sm">"{aircraft.nickname}"</p>}
              <p className="text-[#666] text-sm">{[aircraft.manufacturer, aircraft.model].filter(Boolean).join(' ')}{aircraft.year ? ` (${aircraft.year})` : ''}</p>
            </div>
            {aircraft.home_airport && (
              <span className="text-xs bg-[#f5f5f5] text-[#666] px-3 py-1 rounded-full">{aircraft.home_airport}</span>
            )}
          </div>
          {/* Export + Share buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            <a href={`/api/portal/aircraft/${encodeURIComponent(tail)}/pdf`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#007CB1] text-white text-xs font-medium rounded-lg hover:bg-[#006a9a] transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export Cleaning Log
            </a>
            <button onClick={async () => {
              setShareLoading(true);
              try {
                const res = await fetch(`/api/portal/aircraft/${encodeURIComponent(tail)}/share`, { method: 'POST' });
                if (res.ok) {
                  const d = await res.json();
                  setShareUrl(d.share_url);
                  navigator.clipboard?.writeText(d.share_url);
                }
              } catch {}
              setShareLoading(false);
            }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#ddd] text-[#333] text-xs font-medium rounded-lg hover:bg-[#f5f5f5] transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
              {shareLoading ? 'Creating...' : 'Share Link'}
            </button>
          </div>
          {shareUrl && (
            <div className="mt-2 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <input value={shareUrl} readOnly className="flex-1 text-xs text-[#333] bg-transparent outline-none" />
              <button onClick={() => { navigator.clipboard?.writeText(shareUrl); }} className="text-xs text-green-600 font-medium hover:underline shrink-0">Copy</button>
              <button onClick={() => setShareUrl(null)} className="text-green-400 hover:text-green-600">&times;</button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 text-center">
            <p className="text-2xl font-bold text-[#0D1B2A]">{stats.total_services}</p>
            <p className="text-xs text-[#999]">Total Services</p>
          </div>
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 text-center">
            <p className="text-2xl font-bold text-[#007CB1]">${stats.total_spent?.toLocaleString() || '0'}</p>
            <p className="text-xs text-[#999]">Total Spent</p>
          </div>
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 text-center">
            <p className="text-2xl font-bold text-[#0D1B2A]">{stats.days_since_last_service ?? '—'}</p>
            <p className="text-xs text-[#999]">Days Since Service</p>
          </div>
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 text-center">
            <p className="text-2xl font-bold text-[#0D1B2A]">{photos.length}</p>
            <p className="text-xs text-[#999]">Photos</p>
          </div>
        </div>

        {/* Service Interval Alert */}
        {stats.days_since_last_service !== null && stats.days_since_last_service > 45 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <span className="text-amber-500 text-lg">&#9888;</span>
            <div>
              <p className="text-sm font-medium text-amber-800">Service reminder</p>
              <p className="text-xs text-amber-700">Last service was {stats.days_since_last_service} days ago. Recommended wash interval is 30-60 days.</p>
            </div>
          </div>
        )}

        {/* Standing Notes */}
        {standing_notes.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Aircraft Notes</h2>
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 space-y-2">
              {standing_notes.map((n, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-[#007CB1] mt-0.5">&bull;</span>
                  <p className="text-[#333]">{n.note}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-[#0D1B2A]">Service Photos</h2>
              <div className="flex gap-1">
                {['all', 'before', 'after'].map(tab => (
                  <button key={tab} onClick={() => setPhotoTab(tab)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${photoTab === tab ? 'bg-[#007CB1] text-white' : 'bg-[#f5f5f5] text-[#666] hover:bg-[#eee]'}`}>
                    {tab === 'all' ? `All (${photos.length})` : tab === 'before' ? `Before (${beforePhotos.length})` : `After (${afterPhotos.length})`}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredPhotos.slice(0, 20).map(p => (
                <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-[#eee]">
                  <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Service Timeline */}
        <section>
          <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Service History</h2>
          {services.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-8 text-center">
              <p className="text-[#999] text-sm">No service history for this aircraft yet</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-[#e5e7eb]" />
              <div className="space-y-4">
                {services.map((s, i) => (
                  <div key={s.id} className="relative pl-10">
                    <div className={`absolute left-2.5 top-4 w-3 h-3 rounded-full border-2 border-white ${s.status === 'completed' ? 'bg-green-500' : s.status === 'in_progress' ? 'bg-amber-500' : 'bg-[#007CB1]'}`} />
                    <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <p className="font-medium text-[#0D1B2A] text-sm">{s.aircraft || 'Service'}</p>
                          <p className="text-xs text-[#999]">
                            {s.scheduled_date ? new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : new Date(s.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            {s.airport ? ` \u00B7 ${s.airport}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>
                            {s.status?.replace('_', ' ')}
                          </span>
                          {s.total_price > 0 && <p className="text-sm font-medium text-[#0D1B2A] mt-1">${parseFloat(s.total_price).toLocaleString()}</p>}
                        </div>
                      </div>
                      {s.line_items && Array.isArray(s.line_items) && s.line_items.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[#f0f0f0]">
                          {s.line_items.slice(0, 3).map((li, j) => (
                            <p key={j} className="text-xs text-[#666]">{li.description || li.service || li.name}</p>
                          ))}
                          {s.line_items.length > 3 && <p className="text-xs text-[#999]">+{s.line_items.length - 3} more</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <footer className="text-center py-6">
          <p className="text-[#ccc] text-xs">Powered by Shiny Jets Aviation</p>
        </footer>
      </main>
    </div>
  );
}
