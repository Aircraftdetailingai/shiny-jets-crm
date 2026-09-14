"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import MediaLightbox from '@/components/MediaLightbox';

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-50 text-blue-600',
  viewed: 'bg-blue-50 text-blue-600',
  accepted: 'bg-green-50 text-green-600',
  paid: 'bg-green-50 text-green-700',
  scheduled: 'bg-purple-50 text-purple-600',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-green-50 text-green-700',
};

function statusLabel(status) {
  if (!status) return 'Unknown';
  return String(status).replace(/_/g, ' ');
}

function ProgressBar({ value }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-[#007CB1]">Progress</span>
        <span className="text-[11px] font-semibold text-[#0D1B2A]">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#eef2f5] overflow-hidden">
        <div className="h-full rounded-full bg-[#007CB1] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusChip({ status }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {statusLabel(status)}
    </span>
  );
}

export default function SharedAircraftPage() {
  const params = useParams();
  const tail = decodeURIComponent(params.tail);
  const shareToken = params.token;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoTab, setPhotoTab] = useState('all');
  const [lightboxIndex, setLightboxIndex] = useState(null);

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
  const photoList = photos || [];
  const beforePhotos = photoList.filter(p => p.category === 'before' || (!p.category && p.media_type?.startsWith('before')));
  const afterPhotos = photoList.filter(p => p.category === 'after' || (!p.category && p.media_type?.startsWith('after')));
  const inProgressPhotos = photoList.filter(p => p.category === 'in_progress' || p.live);
  const filteredPhotos =
    photoTab === 'before' ? beforePhotos
      : photoTab === 'after' ? afterPhotos
        : photoTab === 'in_progress' ? inProgressPhotos
          : photoList;

  const liveJobs = (services || []).filter(
    s => s.progress_percentage !== null && s.progress_percentage !== undefined && ['in_progress', 'scheduled', 'accepted'].includes(s.status),
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="bg-[#007CB1] text-white text-center py-2 text-sm">
        Shared by {owner_name || 'Aircraft Owner'} · Read-only
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
            { val: photoList.length, label: 'Photos' },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-[#e5e7eb] p-4 text-center">
              <p className="text-2xl font-bold text-[#0D1B2A]">{s.val}</p>
              <p className="text-xs text-[#999]">{s.label}</p>
            </div>
          ))}
        </div>

        {liveJobs.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Live Job Progress</h2>
            <div className="space-y-3">
              {liveJobs.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border border-amber-200 p-4">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <p className="font-medium text-[#0D1B2A] text-sm">{s.title || s.aircraft || 'Service'}</p>
                      <p className="text-xs text-[#999]">
                        {s.scheduled_date || 'In progress'}
                        {s.airport ? ` · ${s.airport}` : ''}
                      </p>
                    </div>
                    <StatusChip status={s.status} />
                  </div>
                  <ProgressBar value={s.progress_percentage} />
                </div>
              ))}
            </div>
          </section>
        )}

        {photoList.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-lg font-bold text-[#0D1B2A]">Service Photos</h2>
              <div className="flex gap-1 flex-wrap">
                {[
                  { id: 'all', label: `All (${photoList.length})` },
                  { id: 'before', label: `Before (${beforePhotos.length})` },
                  { id: 'in_progress', label: `In Progress (${inProgressPhotos.length})` },
                  { id: 'after', label: `After (${afterPhotos.length})` },
                ].filter(tab => tab.id === 'all' || (tab.id === 'before' && beforePhotos.length) || (tab.id === 'after' && afterPhotos.length) || (tab.id === 'in_progress' && inProgressPhotos.length)).map(tab => (
                  <button key={tab.id} onClick={() => { setPhotoTab(tab.id); setLightboxIndex(null); }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${photoTab === tab.id ? 'bg-[#007CB1] text-white' : 'bg-[#f5f5f5] text-[#666] hover:bg-[#eee]'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {filteredPhotos.slice(0, 24).map((p, i) => (
                <button key={p.id} onClick={() => setLightboxIndex(i)} className="aspect-square rounded-lg overflow-hidden bg-[#eee] relative cursor-pointer">
                  <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {(p.category === 'in_progress' || p.live) && (
                    <span className="absolute bottom-1 left-1 text-[9px] font-semibold bg-amber-500 text-white px-1.5 py-0.5 rounded">Live</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Service History</h2>
          <div className="space-y-2">
            {(services || []).map(s => (
              <div key={s.id} className="bg-white rounded-xl border border-[#e5e7eb] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#0D1B2A] text-sm">{s.title || s.aircraft || 'Service'}</p>
                    <p className="text-xs text-[#999]">{s.scheduled_date || s.created_at?.split('T')[0]}{s.airport ? ` \u00B7 ${s.airport}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <StatusChip status={s.status} />
                    {s.total_price > 0 && <p className="text-xs text-[#666] mt-1">${parseFloat(s.total_price).toLocaleString()}</p>}
                  </div>
                </div>
                {s.progress_percentage !== null && s.progress_percentage !== undefined && (
                  <ProgressBar value={s.progress_percentage} />
                )}
              </div>
            ))}
          </div>
        </section>

        <footer className="text-center py-6">
          <a href="/portal/login" className="text-[#007CB1] text-xs hover:underline mt-1 inline-block">Create your own free aircraft portal</a>
        </footer>
      </main>

      <MediaLightbox
        items={filteredPhotos.slice(0, 24)}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNav={setLightboxIndex}
      />
    </div>
  );
}
