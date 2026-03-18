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
  const [gcalStatus, setGcalStatus] = useState({ connected: false });
  const [gcalConnecting, setGcalConnecting] = useState(false);
  const [gcalError, setGcalError] = useState(null);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalSyncResult, setGcalSyncResult] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('vector_token');
    if (!token) {
      router.push('/login');
      return;
    }
    checkQBStatus();
    checkGCalStatus();
  }, [router]);

  // Handle callback query params
  useEffect(() => {
    const qbParam = params.get('quickbooks');
    if (qbParam === 'success') {
      toastSuccess('QuickBooks connected successfully!');
      checkQBStatus();
    } else if (qbParam === 'error') {
      const message = params.get('message');
      setQbError(message || 'Failed to connect QuickBooks');
    }

    const gcalParam = params.get('gcal');
    if (gcalParam === 'success') {
      toastSuccess('Google Calendar connected successfully!');
      checkGCalStatus();
    } else if (gcalParam === 'error') {
      const message = params.get('message');
      setGcalError(message || 'Failed to connect Google Calendar');
    }
  }, [params]);

  const checkQBStatus = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/quickbooks/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQbStatus(data);
      }
    } catch (err) {
      console.log('Failed to check QB status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectQB = async () => {
    setQbConnecting(true);
    setQbError(null);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/quickbooks/auth', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setQbError(data.error);
      }
    } catch (err) {
      setQbError(`Network error: ${err.message}`);
    } finally {
      setQbConnecting(false);
    }
  };

  const handleDisconnectQB = async () => {
    if (!confirm('Are you sure you want to disconnect QuickBooks?')) return;
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/quickbooks/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setQbStatus({ connected: false, status: 'NOT_CONNECTED' });
        setImportResult(null);
        toastSuccess('QuickBooks disconnected');
      }
    } catch (err) {
      toastError('Failed to disconnect');
    }
  };

  const handleImportCustomers = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/quickbooks/import-customers', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.reconnect) {
        setQbError('QuickBooks session expired. Please reconnect.');
        setQbStatus({ connected: false, status: 'TOKEN_EXPIRED' });
        return;
      }
      if (data.success) {
        setImportResult(data);
        toastSuccess(`Imported ${data.imported} customers from QuickBooks`);
      } else {
        toastError(data.error || 'Import failed');
      }
    } catch (err) {
      toastError(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const checkGCalStatus = async () => {
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/google-calendar/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGcalStatus(data);
      }
    } catch (err) {
      console.log('Failed to check GCal status:', err);
    }
  };

  const handleConnectGCal = async () => {
    setGcalConnecting(true);
    setGcalError(null);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/google-calendar/auth', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setGcalError(data.error);
      }
    } catch (err) {
      setGcalError(`Network error: ${err.message}`);
    } finally {
      setGcalConnecting(false);
    }
  };

  const handleDisconnectGCal = async () => {
    if (!confirm('Are you sure you want to disconnect Google Calendar?')) return;
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/google-calendar/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setGcalStatus({ connected: false });
        setGcalSyncResult(null);
        toastSuccess('Google Calendar disconnected');
      }
    } catch (err) {
      toastError('Failed to disconnect');
    }
  };

  const handleSyncGCal = async () => {
    setGcalSyncing(true);
    setGcalSyncResult(null);
    try {
      const token = localStorage.getItem('vector_token');
      const res = await fetch('/api/google-calendar/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setGcalSyncResult(data);
        toastSuccess(`Synced ${data.synced} events from Google Calendar`);
        checkGCalStatus();
      } else {
        toastError(data.error || 'Sync failed');
      }
    } catch (err) {
      toastError(`Sync failed: ${err.message}`);
    } finally {
      setGcalSyncing(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading integrations..." />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white">Integrations</h2>

      {/* QuickBooks Card */}
      <div className="bg-white p-5 rounded-lg shadow">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">QB</div>
          <div>
            <h3 className="font-semibold text-gray-900">QuickBooks</h3>
            <p className="text-sm text-gray-500">Import customers from your QuickBooks account</p>
          </div>
        </div>

        {qbError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
            <span>{qbError}</span>
            <button onClick={() => setQbError(null)} className="ml-2 text-red-400 hover:text-red-600 font-bold">&times;</button>
          </div>
        )}

        {qbStatus.connected && qbStatus.status === 'ACTIVE' ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span className="text-green-700 font-medium text-sm">Connected</span>
            </div>
            {qbStatus.connected_at && (
              <p className="text-xs text-gray-500 mb-4">
                Connected {new Date(qbStatus.connected_at).toLocaleDateString()}
              </p>
            )}

            <button
              onClick={handleImportCustomers}
              disabled={importing}
              className="w-full px-4 py-2.5 rounded-lg bg-v-gold text-white hover:bg-v-gold-dim disabled:opacity-50 font-semibold text-sm mb-2"
            >
              {importing ? 'Importing customers...' : 'Import Customers from QuickBooks'}
            </button>

            {importResult && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                <p className="font-semibold text-green-800 mb-1">Import Complete</p>
                <ul className="text-green-700 space-y-0.5 text-xs">
                  <li>Total in QuickBooks: {importResult.total}</li>
                  <li>New customers imported: {importResult.imported}</li>
                  <li>Existing updated: {importResult.updated}</li>
                  <li>Skipped (no email/duplicate): {importResult.skipped}</li>
                </ul>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 text-red-600">
                    <p className="font-medium text-xs">Errors:</p>
                    {importResult.errors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleDisconnectQB}
              className="mt-3 text-xs text-red-500 hover:text-red-700 underline"
            >
              Disconnect QuickBooks
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
              <span className="text-gray-500 font-medium text-sm">Not Connected</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Connect your QuickBooks account to import your existing customer list into Vector.
            </p>
            <button
              onClick={handleConnectQB}
              disabled={qbConnecting}
              className="px-5 py-2.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 font-semibold text-sm"
            >
              {qbConnecting ? 'Connecting...' : 'Connect QuickBooks'}
            </button>
          </div>
        )}
      </div>

      {/* Google Calendar Card */}
      <div className="bg-white p-5 rounded-lg shadow">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z"/></svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Google Calendar</h3>
            <p className="text-sm text-gray-500">Two-way sync between Vector jobs and your Google Calendar</p>
          </div>
        </div>

        {gcalError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
            <span>{gcalError}</span>
            <button onClick={() => setGcalError(null)} className="ml-2 text-red-400 hover:text-red-600 font-bold">&times;</button>
          </div>
        )}

        {gcalStatus.connected ? (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span className="text-green-700 font-medium text-sm">Connected</span>
            </div>
            {gcalStatus.connected_at && (
              <p className="text-xs text-gray-500 mb-1">
                Connected {new Date(gcalStatus.connected_at).toLocaleDateString()}
              </p>
            )}
            {gcalStatus.last_sync_at && (
              <p className="text-xs text-gray-500 mb-4">
                Last synced {new Date(gcalStatus.last_sync_at).toLocaleString()}
              </p>
            )}

            <button
              onClick={handleSyncGCal}
              disabled={gcalSyncing}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 font-semibold text-sm mb-2"
            >
              {gcalSyncing ? 'Syncing...' : 'Sync Now'}
            </button>

            {gcalSyncResult && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                <p className="font-semibold text-blue-800 mb-1">Sync Complete</p>
                <ul className="text-blue-700 space-y-0.5 text-xs">
                  <li>Events synced: {gcalSyncResult.synced}</li>
                  <li>Events removed: {gcalSyncResult.deleted}</li>
                </ul>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3 mb-2">
              Scheduled jobs in Vector will automatically appear in your Google Calendar.
              Google Calendar events will show as busy blocks on your Vector calendar.
            </p>

            <button
              onClick={handleDisconnectGCal}
              className="mt-1 text-xs text-red-500 hover:text-red-700 underline"
            >
              Disconnect Google Calendar
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
              <span className="text-gray-500 font-medium text-sm">Not Connected</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Connect your Google Calendar to sync Vector jobs and see your busy times on the scheduling calendar.
            </p>
            <button
              onClick={handleConnectGCal}
              disabled={gcalConnecting}
              className="px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-semibold text-sm"
            >
              {gcalConnecting ? 'Connecting...' : 'Connect Google Calendar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 p-4">Loading...</div>}>
      <IntegrationsContent />
    </Suspense>
  );
}
