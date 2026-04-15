"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ROLE_LABELS = {
  aircraft_owner: 'Aircraft Owner',
  pilot: 'Pilot',
  mechanic: 'Mechanic / A&P',
  director_of_maintenance: 'Director of Maintenance',
  fleet_manager: 'Fleet Manager',
  fbo_manager: 'FBO Manager',
};

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

export default function PortalDashboard() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/me')
      .then(r => {
        if (r.status === 401) { router.push('/portal/login'); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        if (d.account && !d.account.onboarding_complete) {
          router.push('/portal/onboarding');
          return;
        }
        setData(d);
      })
      .catch(() => router.push('/portal/login'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#007CB1] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { account, aircraft, services, upcoming } = data;
  const displayName = [account.first_name, account.last_name].filter(Boolean).join(' ') || account.name || account.email;

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e7eb] px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#007CB1]/10 flex items-center justify-center text-[#007CB1] font-bold text-sm">
              {(account.first_name?.[0] || account.name?.[0] || 'U').toUpperCase()}
            </div>
            <div>
              <h1 className="font-semibold text-[#0D1B2A] text-lg leading-tight">{displayName}</h1>
              <span className="text-xs text-[#007CB1] font-medium">{ROLE_LABELS[account.role] || 'Customer'}</span>
            </div>
          </div>
          <button onClick={() => {
            document.cookie = 'portal_token=; path=/; max-age=0';
            router.push('/portal/login');
          }} className="text-sm text-[#999] hover:text-[#666]">Sign out</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* My Aircraft */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-[#0D1B2A]">My Aircraft</h2>
            <button onClick={() => router.push('/portal/onboarding')} className="text-sm text-[#007CB1] hover:underline">+ Add aircraft</button>
          </div>
          {aircraft.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-8 text-center">
              <p className="text-[#999] text-sm mb-3">No aircraft added yet</p>
              <button onClick={() => router.push('/portal/onboarding')} className="text-[#007CB1] text-sm font-medium hover:underline">Add your first aircraft</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {aircraft.map(ac => (
                <button key={ac.id} onClick={() => router.push(`/portal/aircraft/${encodeURIComponent(ac.tail_number)}`)}
                  className="bg-white rounded-xl border border-[#e5e7eb] p-4 text-left hover:border-[#007CB1]/30 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-lg font-bold text-[#0D1B2A]">{ac.tail_number}</span>
                    {ac.storage_type && <span className="text-[10px] uppercase text-[#999] bg-[#f5f5f5] px-2 py-0.5 rounded">{ac.storage_type?.replace('_', '-')}</span>}
                  </div>
                  {ac.nickname && <p className="text-sm text-[#007CB1] mb-1">"{ac.nickname}"</p>}
                  <p className="text-sm text-[#666]">{[ac.manufacturer, ac.model].filter(Boolean).join(' ') || 'Aircraft'}</p>
                  {ac.home_airport && <p className="text-xs text-[#999] mt-1">{ac.home_airport}</p>}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Upcoming</h2>
            <div className="space-y-2">
              {upcoming.map(s => (
                <div key={s.id} className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-[#0D1B2A] text-sm">{s.aircraft || 'Service'}{s.tail_number ? ` \u00B7 ${s.tail_number}` : ''}</p>
                    <p className="text-xs text-[#999]">{s.scheduled_date ? new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Date TBD'}</p>
                    {s.airport && <p className="text-xs text-[#999]">{s.airport}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>
                    {s.status?.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Services */}
        <section>
          <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Recent Services</h2>
          {services.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-8 text-center">
              <p className="text-[#999] text-sm">No services yet. When a detailer sends you a quote, it will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {services.map(s => (
                <button key={s.id} onClick={() => {
                  if (s.tail_number) router.push(`/portal/aircraft/${encodeURIComponent(s.tail_number)}`);
                }} className="w-full bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center justify-between text-left hover:border-[#007CB1]/20 transition-colors">
                  <div>
                    <p className="font-medium text-[#0D1B2A] text-sm">{s.aircraft || 'Service'}{s.tail_number ? ` \u00B7 ${s.tail_number}` : ''}</p>
                    <p className="text-xs text-[#999]">{new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{s.airport ? ` \u00B7 ${s.airport}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>
                      {s.status?.replace('_', ' ')}
                    </span>
                    {s.total_price > 0 && <p className="text-xs text-[#666] mt-1">${parseFloat(s.total_price).toLocaleString()}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Documents section placeholder */}
        <section>
          <h2 className="text-lg font-bold text-[#0D1B2A] mb-3">Documents</h2>
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {services.filter(s => s.status === 'completed' || s.total_price > 0).slice(0, 6).map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-[#f9f9f9] rounded-lg">
                  <svg className="w-5 h-5 text-[#007CB1] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#333] truncate">{s.aircraft || 'Service'}</p>
                    <p className="text-[10px] text-[#999]">{new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {services.filter(s => s.status === 'completed' || s.total_price > 0).length === 0 && (
                <p className="text-[#999] text-sm col-span-3 text-center py-4">No documents yet</p>
              )}
            </div>
          </div>
        </section>

        {/* Find a Detailer */}
        <section>
          <div className="bg-gradient-to-r from-[#0D1B2A] to-[#1a3550] rounded-xl p-6 text-center">
            <h3 className="text-white font-semibold text-lg mb-2">Need aircraft detailing?</h3>
            <p className="text-white/60 text-sm mb-4">Find certified detailers near your home airport</p>
            <a href="https://directory.shinyjets.com" target="_blank" rel="noopener noreferrer"
              className="inline-block bg-[#007CB1] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#006a9a] transition-colors">
              Browse Directory
            </a>
          </div>
        </section>

        <footer className="text-center py-6">
          <p className="text-[#ccc] text-xs">Powered by Shiny Jets Aviation</p>
        </footer>
      </main>
    </div>
  );
}
