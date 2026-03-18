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
  const [qbStatus, setQbStatus] = useState({ connected: false, status: 'UNKNOWN' });
  const [qbConnecting, setQbConnecting] = useState(false);
  const [qbError, setQbError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Google Calendar state
  const [gcalStatus, setGcalStatus] = useState({ connected: false, configured: false, method: null });
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [gcalError, setGcalError] = useState(null);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalSyncResult, setGcalSyncResult] = useState(null);

  // ICS import state
  const [icsUrl, setIcsUrl] = useState('');
  const [icsImporting, setIcsImporting] = useState(false);
  const [icsResult, setIcsResult] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) { router.push('/login'); return; }
    checkQBStatus();
    checkGCalStatus();
  }, [router]);

  useEffect(() => {
    const qbParam = params.get('quickbooks');
    if (qbParam === 'success') { toastSuccess('QuickBooks connected successfully!'); checkQBStatus(); }
    else if (qbParam === 'error') setQbError(params.get('message') || 'Failed to connect QuickBooks');

    const gcalParam = params.get('gcal');
    if (gcalParam === 'success') { toastSuccess('Google Calendar connected successfully!'); checkGCalStatus(); }
    else if (gcalParam === 'error') setGcalError(params.get('message') || 'Failed to connect Google Calendar');
  }, [params]);

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('vector_token')}`,
    'Content-Type': 'application/json',
  });

  const checkQBStatus = async () => {
    try {
      const res = await fetch('/api/quickbooks/status', { headers: getHeaders() });
      if (res.ok) setQbStatus(await res.json());
    } catch (err) {
      console.log('Failed to check QB status:', err);
    } finally {
      setLoading(false);
    }
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
      if (data.reconnect) { setQbError('QuickBooks session expired. Please reconnect.'); setQbStatus({ connected: false, status: 'TOKEN_EXPIRED' }); return; }
      if (data.success) { setImportResult(data); toastSuccess(`Imported ${data.imported} customers from QuickBooks`); }
      else toastError(data.error || 'Import failed');
    } catch (err) { toastError(`Import failed: ${err.message}`); }
    finally { setImporting(false); }
  };

  const checkGCalStatus = async () => {
    try {
      const res = await fetch('/api/google-calendar/status', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setGcalStatus(data);
        if (data.icsUrl) setIcsUrl(data.icsUrl);
      }
    } catch (err) {
      console.log('Failed to check GCal status:', err);
    }
  };

  const handleConnectGCal = async () => {
    setGcalConnecting(true); setGcalError(null);
    try {
      const res = await fetch('/api/google-calendar/auth', { method: 'POST', headers: getHeaders() });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else if (data.configured === false) setGcalError('Google Calendar OAuth is not configured. Use the Calendar URL sync below.');
      else if (data.error) setGcalError(data.error);
    } catch (err) { setGcalError(`Network error: ${err.message}`); }
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
    if (!icsUrl.trim()) return;
    setIcsImporting(true); setIcsResult(null); setGcalError(null);
    try {
      const res = await fetch('/api/google-calendar/ics-import', {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ icsUrl: icsUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setIcsResult(data);
        setGcalStatus(prev => ({ ...prev, connected: true, method: 'ics', icsUrl: icsUrl.trim(), icsLastSync: new Date().toISOString() }));
        toastSuccess(`Imported ${data.relevantEvents} events, blocked ${data.blockedDatesAdded} new dates`);
      } else {
        toastError(data.error || 'Import failed');
      }
    } catch (err) { toastError(`Import failed: ${err.message}`); }
    finally { setIcsImporting(false); }
  };

  const handleDisconnectIcs = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/google-calendar/ics-disconnect', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setGcalStatus(prev => ({ ...prev, connected: false, method: null, icsUrl: null, icsLastSync: null }));
        setIcsUrl('');
        setIcsResult(null);
        toastSuccess('Calendar URL disconnected');
      }
    } catch { toastError('Failed to disconnect'); }
  };

  if (loading) return <LoadingSpinner message="Loading integrations..." />;

  const icsConnected = gcalStatus.method === 'ics' && gcalStatus.icsUrl;
  const oauthConnected = gcalStatus.method === 'oauth' && gcalStatus.connected;

  return (
    <div className="space-y-6">
      <h2 className="text-xs font-medium uppercase tracking-widest text-v-gold pb-2 border-b border-v-gold/20">Integrations</h2>

      {/* Google Calendar Card */}
      <div className="border border-v-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 border border-v-gold/30 flex items-center justify-center text-v-gold">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-v-text-primary">Google Calendar</h3>
            <p className="text-sm text-v-text-secondary">Sync your calendar events as blocked dates in Vector</p>
          </div>
        </div>

        {gcalError && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
            <span>{gcalError}</span>
            <button onClick={() => setGcalError(null)} className="ml-2 text-red-400 hover:text-red-300 font-bold">&times;</button>
          </div>
        )}

        {/* OAuth Connected State */}
        {oauthConnected && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-green-400">&#10003;</span>
              <span className="text-green-400 font-medium text-sm">Connected via Google OAuth</span>
            </div>
            {gcalStatus.connected_at && (
              <p className="text-xs text-v-text-secondary mb-1">Connected {new Date(gcalStatus.connected_at).toLocaleDateString()}</p>
            )}
            {gcalStatus.last_sync_at && (
              <p className="text-xs text-v-text-secondary mb-4">Last synced {new Date(gcalStatus.last_sync_at).toLocaleString()}</p>
            )}

            <button onClick={handleSyncGCal} disabled={gcalSyncing}
              className="w-full px-4 py-2.5 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors mb-2">
              {gcalSyncing ? 'Syncing...' : 'Sync Now'}
            </button>

            {gcalSyncResult && (
              <div className="mt-3 p-3 bg-green-900/20 border border-green-500/30 text-sm">
                <p className="font-semibold text-green-400 mb-1">Sync Complete</p>
                <ul className="text-green-400/80 space-y-0.5 text-xs">
                  <li>Events synced: {gcalSyncResult.synced}</li>
                  <li>Events removed: {gcalSyncResult.deleted}</li>
                </ul>
              </div>
            )}

            <p className="text-xs text-v-text-secondary mt-3 mb-2">
              Scheduled jobs in Vector will automatically appear in your Google Calendar.
              Google Calendar events will show as busy blocks on your Vector calendar.
            </p>

            <button onClick={handleDisconnectGCal} className="mt-1 text-xs text-red-400 hover:text-red-300 underline">
              Disconnect Google Calendar
            </button>
          </div>
        )}

        {/* ICS Connected State */}
        {icsConnected && !oauthConnected && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-green-400">&#10003;</span>
              <span className="text-green-400 font-medium text-sm">Synced via Calendar URL</span>
            </div>
            {gcalStatus.icsLastSync && (
              <p className="text-xs text-v-text-secondary mb-4">
                Last synced {new Date(gcalStatus.icsLastSync).toLocaleString()}
              </p>
            )}

            <div className="p-3 bg-v-surface border border-v-border mb-4">
              <p className="text-xs text-v-text-secondary mb-2 truncate" title={gcalStatus.icsUrl}>
                {gcalStatus.icsUrl}
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={handleIcsImport} disabled={icsImporting}
                className="flex-1 px-4 py-2.5 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors">
                {icsImporting ? 'Syncing...' : 'Re-sync Now'}
              </button>
            </div>

            {icsResult && (
              <div className="mt-3 p-3 bg-green-900/20 border border-green-500/30 text-sm">
                <p className="font-semibold text-green-400 mb-1">Sync Complete</p>
                <ul className="text-green-400/80 space-y-0.5 text-xs">
                  <li>Events in range (next 90 days): {icsResult.relevantEvents}</li>
                  <li>New blocked dates added: {icsResult.blockedDatesAdded}</li>
                  <li>Total blocked dates: {icsResult.totalBlockedDates}</li>
                </ul>
              </div>
            )}

            <button onClick={handleDisconnectIcs} className="mt-3 text-xs text-red-400 hover:text-red-300 underline">
              Disconnect Calendar URL
            </button>
          </div>
        )}

        {/* Not Connected State */}
        {!oauthConnected && !icsConnected && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 bg-v-text-secondary rounded-full"></span>
              <span className="text-v-text-secondary font-medium text-sm">Not Connected</span>
            </div>

            {/* Option A: ICS Sync (Primary) */}
            <div className="p-4 border border-v-gold/30 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-v-gold text-xs uppercase tracking-widest font-medium">Option A</span>
                <span className="text-xs text-v-text-secondary border border-v-border px-2 py-0.5">Recommended</span>
              </div>
              <h4 className="text-sm font-semibold text-v-text-primary mb-1">Sync via Calendar URL</h4>
              <p className="text-xs text-v-text-secondary mb-3">
                In Google Calendar, click the <strong className="text-v-text-primary">&#8942;</strong> next to your calendar &rarr; <strong className="text-v-text-primary">Settings and sharing</strong> &rarr; scroll to <strong className="text-v-text-primary">&ldquo;Secret address in iCal format&rdquo;</strong> &rarr; copy and paste the URL below.
              </p>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={icsUrl}
                  onChange={e => setIcsUrl(e.target.value)}
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  className="flex-1 px-3 py-2.5 bg-v-surface border border-v-border text-v-text-primary text-sm focus:border-v-gold outline-none placeholder:text-v-text-secondary/50"
                />
                <button
                  onClick={handleIcsImport}
                  disabled={icsImporting || !icsUrl.trim()}
                  className="px-5 py-2.5 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {icsImporting ? 'Importing...' : 'Connect'}
                </button>
              </div>

              {icsResult && (
                <div className="mt-3 p-3 bg-green-900/20 border border-green-500/30 text-sm">
                  <p className="font-semibold text-green-400 mb-1">Import Complete</p>
                  <ul className="text-green-400/80 space-y-0.5 text-xs">
                    <li>Total events found: {icsResult.totalEvents}</li>
                    <li>Events in range (next 90 days): {icsResult.relevantEvents}</li>
                    <li>New blocked dates added: {icsResult.blockedDatesAdded}</li>
                    <li>Total blocked dates: {icsResult.totalBlockedDates}</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Option B: OAuth (when configured) / Coming Soon */}
            <div className="p-4 border border-v-border">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-v-text-secondary text-xs uppercase tracking-widest font-medium">Option B</span>
              </div>
              <h4 className="text-sm font-semibold text-v-text-primary mb-1">Connect with Google Account</h4>
              {gcalStatus.configured ? (
                <>
                  <p className="text-xs text-v-text-secondary mb-3">
                    Full two-way sync: Vector jobs appear in Google Calendar, and your Google events show as busy blocks.
                  </p>
                  <button onClick={handleConnectGCal} disabled={gcalConnecting}
                    className="px-5 py-2.5 border border-v-gold text-v-gold text-xs font-semibold uppercase tracking-widest hover:bg-v-gold hover:text-v-charcoal disabled:opacity-50 transition-colors">
                    {gcalConnecting ? 'Connecting...' : 'Connect Google Account'}
                  </button>
                </>
              ) : (
                <p className="text-xs text-v-text-secondary">
                  Two-way Google OAuth sync is coming soon. Use the Calendar URL option above to sync your events now.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* QuickBooks Card */}
      <div className="border border-v-border p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 border border-green-500/30 flex items-center justify-center text-green-400 font-bold text-sm">QB</div>
          <div>
            <h3 className="font-semibold text-v-text-primary">QuickBooks</h3>
            <p className="text-sm text-v-text-secondary">Import customers from your QuickBooks account</p>
          </div>
        </div>

        {qbError && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
            <span>{qbError}</span>
            <button onClick={() => setQbError(null)} className="ml-2 text-red-400 hover:text-red-300 font-bold">&times;</button>
          </div>
        )}

        {qbStatus.connected && qbStatus.status === 'ACTIVE' ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-green-400">&#10003;</span>
              <span className="text-green-400 font-medium text-sm">Connected</span>
            </div>
            {qbStatus.connected_at && (
              <p className="text-xs text-v-text-secondary mb-4">Connected {new Date(qbStatus.connected_at).toLocaleDateString()}</p>
            )}

            <button onClick={handleImportCustomers} disabled={importing}
              className="w-full px-4 py-2.5 bg-v-gold text-v-charcoal text-xs font-semibold uppercase tracking-widest hover:bg-v-gold-dim disabled:opacity-50 transition-colors mb-2">
              {importing ? 'Importing customers...' : 'Import Customers from QuickBooks'}
            </button>

            {importResult && (
              <div className="mt-3 p-3 bg-green-900/20 border border-green-500/30 text-sm">
                <p className="font-semibold text-green-400 mb-1">Import Complete</p>
                <ul className="text-green-400/80 space-y-0.5 text-xs">
                  <li>Total in QuickBooks: {importResult.total}</li>
                  <li>New customers imported: {importResult.imported}</li>
                  <li>Existing updated: {importResult.updated}</li>
                  <li>Skipped (no email/duplicate): {importResult.skipped}</li>
                </ul>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 text-red-400">
                    <p className="font-medium text-xs">Errors:</p>
                    {importResult.errors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleDisconnectQB} className="mt-3 text-xs text-red-400 hover:text-red-300 underline">
              Disconnect QuickBooks
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-v-text-secondary rounded-full"></span>
              <span className="text-v-text-secondary font-medium text-sm">Not Connected</span>
            </div>
            <p className="text-sm text-v-text-secondary mb-4">
              Connect your QuickBooks account to import your existing customer list into Vector.
            </p>
            <button onClick={handleConnectQB} disabled={qbConnecting}
              className="px-5 py-2.5 border border-green-500/50 text-green-400 text-xs font-semibold uppercase tracking-widest hover:bg-green-500 hover:text-white disabled:opacity-50 transition-colors">
              {qbConnecting ? 'Connecting...' : 'Connect QuickBooks'}
            </button>
          </div>
        )}
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
