"use client";
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';

function IntegrationsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { success: toastSuccess, error: toastError } = useToast();

  const [loading, setLoading] = useState(true);

  // Calendly state
  const [calendlyUrl, setCalendlyUrl] = useState('');
  const [useCalendlyScheduling, setUseCalendlyScheduling] = useState(false);
  const [calendlySaving, setCalendlySaving] = useState(false);
  const [calendlyDirty, setCalendlyDirty] = useState(false);

  // Google Calendar state
  const [gcalStatus, setGcalStatus] = useState(null); // null = loading, object = loaded
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [gcalError, setGcalError] = useState(null);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalSyncResult, setGcalSyncResult] = useState(null);
  const [icsUrl, setIcsUrl] = useState('');
  const [icsImporting, setIcsImporting] = useState(false);
  const [icsResult, setIcsResult] = useState(null);

  // Google Business Profile state
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState('');
  const [gbpSaving, setGbpSaving] = useState(false);
  const [gbpDirty, setGbpDirty] = useState(false);

  // QuickBooks state
  const [qbStatus, setQbStatus] = useState({ connected: false, status: 'UNKNOWN' });
  const [qbConnecting, setQbConnecting] = useState(false);
  const [qbError, setQbError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    loadAll();
  }, [router]);

  useEffect(() => {
    const gcalParam = params.get('gcal');
    if (gcalParam === 'success') {
      toastSuccess('Google Calendar connected successfully');
      // Small delay to ensure DB write from OAuth callback has settled
      setTimeout(() => checkGCalStatus(), 500);
      // Clean URL without reload
      const url = new URL(window.location);
      url.searchParams.delete('gcal');
      window.history.replaceState({}, '', url.pathname + (url.search || ''));
    } else if (gcalParam === 'error') {
      setGcalError(params.get('message') || 'Failed to connect Google Calendar');
    }
    const qbParam = params.get('quickbooks');
    if (qbParam === 'success') { toastSuccess('QuickBooks connected!'); checkQBStatus(); }
    else if (qbParam === 'error') setQbError(params.get('message') || 'Failed to connect QuickBooks');
  }, [params]);

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
    'Content-Type': 'application/json',
  });

  const loadAll = async () => {
    await Promise.all([loadCalendly(), checkGCalStatus(), checkQBStatus(), loadGoogleBusiness()]);
    setLoading(false);
  };

  // === CALENDLY ===
  const loadCalendly = async () => {
    try {
      const stored = localStorage.getItem('vector_user');
      if (stored) {
        const u = JSON.parse(stored);
        setCalendlyUrl(u.calendly_url || '');
        setUseCalendlyScheduling(u.use_calendly_scheduling || false);
      }
    } catch {}
  };

  const saveCalendly = async () => {
    setCalendlySaving(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ calendly_url: calendlyUrl || null, use_calendly_scheduling: useCalendlyScheduling }),
      });
      if (res.ok) {
        toastSuccess('Calendly settings saved');
        setCalendlyDirty(false);
        // Update localStorage
        try {
          const u = JSON.parse(localStorage.getItem('vector_user') || '{}');
          u.calendly_url = calendlyUrl || null;
          u.use_calendly_scheduling = useCalendlyScheduling;
          localStorage.setItem('vector_user', JSON.stringify(u));
        } catch {}
      } else toastError('Failed to save Calendly settings');
    } catch { toastError('Failed to save'); }
    finally { setCalendlySaving(false); }
  };

  // === GOOGLE CALENDAR ===
  const checkGCalStatus = async () => {
    try {
      const res = await fetch('/api/google-calendar/status', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        console.log('[gcal] status response:', JSON.stringify(data));
        setGcalStatus(data);
        if (data.icsUrl) setIcsUrl(data.icsUrl);
      } else {
        console.error('[gcal] status fetch failed:', res.status);
      }
    } catch (err) {
      console.error('[gcal] status fetch error:', err);
    }
  };

  const handleConnectGCal = async () => {
    setGcalConnecting(true); setGcalError(null);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/google-calendar/auth', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.configured) { setGcalError(data.error || 'Google Calendar not configured'); return; }
      if (data.url) window.location.href = data.url;
    } catch (err) { setGcalError(`Error: ${err.message}`); }
    finally { setGcalConnecting(false); }
  };

  const handleDisconnectGCal = async () => {
    try {
      const res = await fetch('/api/google-calendar/disconnect', { method: 'POST', headers: getHeaders() });
      if (res.ok) { setGcalStatus(prev => ({ ...prev, connected: false, method: null })); setGcalSyncResult(null); toastSuccess('Google Calendar disconnected'); }
    } catch { toastError('Failed to disconnect'); }
  };

  const handleSyncGCal = async () => {
    setGcalSyncing(true); setGcalSyncResult(null);
    try {
      const res = await fetch('/api/google-calendar/sync', { method: 'POST', headers: getHeaders() });
      const data = await res.json();
      if (data.success) { setGcalSyncResult(data); toastSuccess(`Synced ${data.synced} events`); checkGCalStatus(); }
      else toastError(data.error || 'Sync failed');
    } catch (err) { toastError(`Sync failed: ${err.message}`); }
    finally { setGcalSyncing(false); }
  };

  const handleIcsImport = async () => {
    const url = icsUrl.trim();
    if (!url) return;
    // Validate the URL looks like an iCal feed
    const looksLikeIcal = url.endsWith('.ics') || url.includes('/ical/') || url.includes('/basic.ics') || url.includes('webcal://');
    const isCalendarViewUrl = url.match(/calendar\.google\.com\/calendar\/u\/\d+\/r/);
    if (isCalendarViewUrl || !looksLikeIcal) {
      setGcalError("Please paste the Secret address in iCal format. It should end in .ics\n\nIn Google Calendar: Settings \u2192 click your calendar \u2192 scroll to \"Secret address in iCal format\" \u2192 copy that URL.");
      return;
    }
    if (!url.startsWith('http')) {
      setGcalError('URL must start with https://');
      return;
    }
    setIcsImporting(true); setIcsResult(null); setGcalError(null);
    try {
      const res = await fetch('/api/google-calendar/ics-import', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ icsUrl: url }),
      });
      const data = await res.json();
      if (data.success) {
        setIcsResult(data);
        setGcalStatus(prev => ({ ...prev, connected: true, method: 'ics', icsUrl: url, icsLastSync: new Date().toISOString() }));
        toastSuccess(`Imported ${data.relevantEvents} events, blocked ${data.blockedDatesAdded} dates`);
      } else {
        setGcalError(data.error || 'Import failed');
      }
    } catch (err) { setGcalError(`Import failed: ${err.message}`); }
    finally { setIcsImporting(false); }
  };

  const handleDisconnectIcs = async () => {
    try {
      const res = await fetch('/api/google-calendar/ics-disconnect', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('vector_token')}` } });
      if (res.ok) {
        setGcalStatus(prev => ({ ...prev, connected: false, method: null, icsUrl: null, icsLastSync: null }));
        setIcsUrl(''); setIcsResult(null);
        toastSuccess('Calendar URL disconnected');
      }
    } catch { toastError('Failed to disconnect'); }
  };

  // === GOOGLE BUSINESS PROFILE ===
  const loadGoogleBusiness = async () => {
    try {
      const res = await fetch('/api/user/me', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        const u = data.user || data;
        setGoogleBusinessUrl(u.google_business_url || '');
      }
    } catch {}
  };

  const saveGoogleBusiness = async () => {
    setGbpSaving(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ google_business_url: googleBusinessUrl || null }),
      });
      if (res.ok) {
        toastSuccess('Saved');
        setGbpDirty(false);
        try {
          const u = JSON.parse(localStorage.getItem('vector_user') || '{}');
          u.google_business_url = googleBusinessUrl || null;
          localStorage.setItem('vector_user', JSON.stringify(u));
        } catch {}
      } else toastError('Failed to save');
    } catch { toastError('Failed to save'); }
    finally { setGbpSaving(false); }
  };

  // === QUICKBOOKS ===
  const checkQBStatus = async () => {
    try {
      const res = await fetch('/api/quickbooks/status', { headers: getHeaders() });
      if (res.ok) setQbStatus(await res.json());
    } catch {}
  };

  const handleConnectQB = async () => {
    setQbConnecting(true); setQbError(null);
    try {
      const res = await fetch('/api/quickbooks/auth', { method: 'POST', headers: getHeaders() });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else if (data.error) setQbError(data.error);
    } catch (err) { setQbError(`Network error: ${err.message}`); }
    finally { setQbConnecting(false); }
  };

  const handleDisconnectQB = async () => {
    try {
      const res = await fetch('/api/quickbooks/disconnect', { method: 'POST', headers: getHeaders() });
      if (res.ok) { setQbStatus({ connected: false, status: 'NOT_CONNECTED' }); setImportResult(null); toastSuccess('QuickBooks disconnected'); }
    } catch { toastError('Failed to disconnect'); }
  };

  const handleImportCustomers = async () => {
    setImporting(true); setImportResult(null);
    try {
      const res = await fetch('/api/quickbooks/import-customers', { method: 'POST', headers: getHeaders() });
      const data = await res.json();
      if (data.reconnect) { setQbError('Session expired. Please reconnect.'); setQbStatus({ connected: false, status: 'TOKEN_EXPIRED' }); return; }
      if (data.success) { setImportResult(data); toastSuccess(`Imported ${data.imported} customers`); }
      else toastError(data.error || 'Import failed');
    } catch (err) { toastError(`Import failed: ${err.message}`); }
    finally { setImporting(false); }
  };

  if (loading) return <LoadingSpinner message="Loading integrations..." />;

  const gcalLoading = gcalStatus === null;
  const icsConnected = gcalStatus?.method === 'ics' && gcalStatus?.icsUrl;
  const oauthConnected = gcalStatus?.method === 'oauth' && gcalStatus?.connected;
  const gcalNeedsReconnect = oauthConnected && gcalStatus?.needsReconnect;
  const gcalConnected = (icsConnected || oauthConnected) && !gcalNeedsReconnect;
  const calendlyConnected = !!calendlyUrl && calendlyUrl.includes('calendly.com');
  const qbConnected = qbStatus.connected && qbStatus.status === 'ACTIVE';
  const gbpConnected = !!googleBusinessUrl && (googleBusinessUrl.includes('google.com') || googleBusinessUrl.includes('maps.google'));

  return (
    <div className="space-y-8">
      <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold pb-2 border-b border-v-gold/20">Integrations</h2>

      {/* ━━━ SCHEDULING ━━━ */}
      <div>
        <h3 className="text-xs font-medium uppercase tracking-widest text-v-text-secondary mb-4">Scheduling</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* CALENDLY CARD */}
          <div className="border border-v-border p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 border border-v-border flex items-center justify-center text-v-text-primary rounded-sm">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
                </div>
                <div>
                  <h4 className="font-semibold text-v-text-primary text-sm">Calendly</h4>
                  <p className="text-xs text-v-text-secondary">Customer scheduling via Calendly</p>
                </div>
              </div>
              {calendlyConnected ? (
                <span className="text-xs text-green-400 border border-green-400/30 px-2 py-0.5 uppercase tracking-wider">Connected</span>
              ) : (
                <span className="text-xs text-v-text-secondary border border-v-border px-2 py-0.5 uppercase tracking-wider">Not Connected</span>
              )}
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Calendly URL</label>
                <input
                  type="url"
                  value={calendlyUrl}
                  onChange={(e) => { setCalendlyUrl(e.target.value); setCalendlyDirty(true); }}
                  placeholder="https://calendly.com/your-name/30min"
                  className="w-full bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
                />
                {calendlyUrl && !calendlyUrl.includes('calendly.com') && (
                  <p className="text-xs text-red-400 mt-1">URL should be a calendly.com link</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-v-text-primary font-medium">Use for scheduling</p>
                  <p className="text-[10px] text-v-text-secondary mt-0.5">
                    {useCalendlyScheduling ? 'Calendly shown after payment' : 'Built-in calendar used'}
                  </p>
                </div>
                <div
                  onClick={() => { setUseCalendlyScheduling(!useCalendlyScheduling); setCalendlyDirty(true); }}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${useCalendlyScheduling ? 'bg-v-gold' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${useCalendlyScheduling ? 'translate-x-5' : ''}`} />
                </div>
              </div>
            </div>

            {calendlyDirty && (
              <button onClick={saveCalendly} disabled={calendlySaving}
                className="mt-4 w-full py-2 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
                {calendlySaving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>

          {/* GOOGLE CALENDAR CARD */}
          <div className="border border-v-border p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 border border-v-border flex items-center justify-center text-v-text-primary rounded-sm">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z"/></svg>
                </div>
                <div>
                  <h4 className="font-semibold text-v-text-primary text-sm">Google Calendar</h4>
                  <p className="text-xs text-v-text-secondary">Sync events as blocked dates</p>
                </div>
              </div>
              {gcalLoading ? (
                <span className="text-xs text-v-text-secondary border border-v-border px-2 py-0.5 uppercase tracking-wider">Checking...</span>
              ) : gcalNeedsReconnect ? (
                <span className="text-xs text-yellow-400 border border-yellow-400/30 px-2 py-0.5 uppercase tracking-wider">Reconnect Required</span>
              ) : gcalConnected ? (
                <span className="text-xs text-green-400 border border-green-400/30 px-2 py-0.5 uppercase tracking-wider">Connected</span>
              ) : (
                <span className="text-xs text-v-text-secondary border border-v-border px-2 py-0.5 uppercase tracking-wider">Not Connected</span>
              )}
            </div>

            {gcalError && (
              <div className="mb-3 p-2 bg-red-900/20 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
                <span>{gcalError}</span>
                <button onClick={() => setGcalError(null)} className="ml-2 font-bold">&times;</button>
              </div>
            )}

            {/* OAuth — Needs Reconnect */}
            {gcalNeedsReconnect && (
              <div className="flex-1">
                {gcalStatus.google_email && <p className="text-xs text-yellow-400 mb-1">Previously connected as {gcalStatus.google_email}</p>}
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-3">
                  <p className="text-xs text-yellow-300">Your calendar connection needs to be refreshed. Click reconnect to restore auto-scheduling.</p>
                </div>
                <button onClick={handleConnectGCal} disabled={gcalConnecting}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-yellow-500 text-black text-xs font-semibold uppercase tracking-widest hover:bg-yellow-400 disabled:opacity-50 transition-colors">
                  {gcalConnecting ? 'Connecting...' : 'Reconnect Google Calendar'}
                </button>
                <button onClick={handleDisconnectGCal} className="mt-3 text-xs text-v-text-secondary hover:text-red-400 underline">Disconnect instead</button>
              </div>
            )}

            {/* OAuth Connected (healthy) */}
            {oauthConnected && !gcalNeedsReconnect && (
              <div className="flex-1">
                {gcalStatus.google_email && <p className="text-xs text-green-400 mb-1">Connected as {gcalStatus.google_email}</p>}
                <p className="text-xs text-v-text-secondary mb-1">{!gcalStatus.google_email ? 'Connected ' : ''}{gcalStatus.connected_at && new Date(gcalStatus.connected_at).toLocaleDateString()}</p>
                {gcalStatus.last_sync_at && <p className="text-xs text-v-text-secondary mb-3">Last synced {new Date(gcalStatus.last_sync_at).toLocaleString()}</p>}
                <button onClick={handleSyncGCal} disabled={gcalSyncing}
                  className="w-full py-2 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
                  {gcalSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
                {gcalSyncResult && <p className="text-xs text-green-400 mt-2">Synced {gcalSyncResult.synced} events</p>}
                <button onClick={handleDisconnectGCal} className="mt-3 text-xs text-red-400 hover:text-red-300 underline">Disconnect</button>
              </div>
            )}

            {/* ICS Connected */}
            {icsConnected && !oauthConnected && (
              <div className="flex-1">
                <p className="text-xs text-v-text-secondary mb-1 truncate" title={gcalStatus.icsUrl}>{gcalStatus.icsUrl}</p>
                {gcalStatus.icsLastSync && <p className="text-xs text-v-text-secondary mb-3">Last synced {new Date(gcalStatus.icsLastSync).toLocaleString()}</p>}
                <button onClick={handleIcsImport} disabled={icsImporting}
                  className="w-full py-2 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
                  {icsImporting ? 'Syncing...' : 'Sync Now'}
                </button>
                {icsResult && <p className="text-xs text-green-400 mt-2">{icsResult.relevantEvents} events, {icsResult.blockedDatesAdded} new blocked dates</p>}
                <button onClick={handleDisconnectIcs} className="mt-3 text-xs text-red-400 hover:text-red-300 underline">Disconnect</button>
              </div>
            )}

            {/* Not Connected */}
            {!gcalLoading && !gcalConnected && !gcalNeedsReconnect && (
              <div className="flex-1 space-y-3">
                {/* Google OAuth button */}
                <button onClick={handleConnectGCal} disabled={gcalConnecting}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-white text-gray-800 rounded-sm text-xs font-medium hover:bg-gray-100 border border-gray-300 disabled:opacity-50 transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  {gcalConnecting ? 'Connecting...' : 'Connect Google Calendar'}
                </button>

                <div className="flex items-center">
                  <div className="flex-grow border-t border-v-border"></div>
                  <span className="mx-3 text-v-text-secondary text-[10px] uppercase tracking-widest">or</span>
                  <div className="flex-grow border-t border-v-border"></div>
                </div>

                <div>
                  <p className="text-[10px] text-v-text-secondary mb-2">
                    Google Calendar &rarr; Settings &rarr; your calendar &rarr; &ldquo;Secret address in iCal format&rdquo;
                  </p>
                  <div className="flex gap-2">
                    <input type="url" value={icsUrl} onChange={e => { setIcsUrl(e.target.value); setGcalError(null); }}
                      placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                      className="flex-1 px-2 py-2 bg-v-surface border border-v-border text-v-text-primary text-xs focus:border-v-gold outline-none placeholder:text-v-text-secondary/50" />
                    <button onClick={handleIcsImport} disabled={icsImporting || !icsUrl.trim()}
                      className="px-3 py-2 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors whitespace-nowrap">
                      {icsImporting ? '...' : 'Connect'}
                    </button>
                  </div>
                  {icsResult && <p className="text-xs text-green-400 mt-2">{icsResult.relevantEvents} events imported</p>}
                  <p className="text-[10px] text-v-text-secondary/60 mt-2">URL should end in .ics — not the regular calendar view URL</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ REVIEWS ━━━ */}
      <div>
        <h3 className="text-xs font-medium uppercase tracking-widest text-v-text-secondary mb-4">Reviews</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* GOOGLE BUSINESS PROFILE CARD */}
          <div className="border border-v-border p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 border border-v-border flex items-center justify-center text-v-text-primary rounded-sm">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                </div>
                <div>
                  <h4 className="font-semibold text-v-text-primary text-sm">Google Business Profile</h4>
                  <p className="text-xs text-v-text-secondary">Import reviews to your listing</p>
                </div>
              </div>
              {gbpConnected ? (
                <span className="text-xs text-green-400 border border-green-400/30 px-2 py-0.5 uppercase tracking-wider">Connected</span>
              ) : (
                <span className="text-xs text-v-text-secondary border border-v-border px-2 py-0.5 uppercase tracking-wider">Not Connected</span>
              )}
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <label className="block text-xs text-v-text-secondary mb-1">Your Google Business Profile URL</label>
                <input
                  type="url"
                  value={googleBusinessUrl}
                  onChange={(e) => { setGoogleBusinessUrl(e.target.value); setGbpDirty(true); }}
                  placeholder="https://maps.google.com/?cid=XXXXXXXXX"
                  className="w-full bg-v-surface border border-v-border text-v-text-primary rounded-sm px-3 py-2 text-sm placeholder-v-text-secondary/50 outline-none focus:border-v-gold/50"
                />
                <p className="text-[10px] text-v-text-secondary/60 mt-1">
                  Search your business on Google, click the business card, then copy the URL from your browser.
                </p>
              </div>
            </div>

            {gbpDirty && (
              <button onClick={saveGoogleBusiness} disabled={gbpSaving}
                className="mt-4 w-full py-2 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
                {gbpSaving ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ━━━ ACCOUNTING ━━━ */}
      <div>
        <h3 className="text-xs font-medium uppercase tracking-widest text-v-text-secondary mb-4">Accounting</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* QUICKBOOKS CARD */}
          <div className="border border-v-border p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 border border-v-border flex items-center justify-center text-green-400 font-bold text-xs rounded-sm">QB</div>
                <div>
                  <h4 className="font-semibold text-v-text-primary text-sm">QuickBooks</h4>
                  <p className="text-xs text-v-text-secondary">Import customers</p>
                </div>
              </div>
              <span className="text-xs text-v-text-secondary border border-v-border px-2 py-0.5 uppercase tracking-wider">CSV Import</span>
            </div>

            <div>
              <p className="text-xs text-v-text-secondary mb-3">
                Import your QuickBooks customer list via CSV export.
              </p>
              <p className="text-[10px] text-v-text-secondary mb-3">
                In QuickBooks: Sales &rarr; Customers &rarr; Export to Excel &rarr; Save as CSV
              </p>
              <a
                href="/settings/import"
                className="inline-block w-full py-2 text-center bg-v-surface border border-v-border text-v-text-primary text-xs font-semibold uppercase tracking-widest hover:bg-white/5 transition-colors"
              >
                Import CSV Data
              </a>
              <p className="text-[10px] text-v-text-secondary mt-3">
                Direct QuickBooks sync coming soon.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ━━━ COMING SOON ━━━ */}
      <div>
        <h3 className="text-xs font-medium uppercase tracking-widest text-v-text-secondary mb-4">Coming Soon</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: 'Xero', desc: 'Accounting sync', icon: 'X' },
            { name: 'Zapier', desc: 'Workflow automation', icon: 'Z' },
            { name: 'Mailchimp', desc: 'Email marketing', icon: 'M' },
            { name: 'Slack', desc: 'Team notifications', icon: 'S' },
          ].map((item) => (
            <div key={item.name} className="border border-v-border/50 p-4 opacity-50">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 border border-v-border flex items-center justify-center text-v-text-secondary text-xs font-bold rounded-sm">{item.icon}</div>
                <div>
                  <h4 className="text-sm font-medium text-v-text-primary">{item.name}</h4>
                  <p className="text-[10px] text-v-text-secondary">{item.desc}</p>
                </div>
              </div>
              <span className="text-[10px] text-v-text-secondary border border-v-border px-2 py-0.5 uppercase tracking-wider">Coming Soon</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="text-v-text-secondary p-4">Loading...</div>}>
      <IntegrationsContent />
    </Suspense>
  );
}
