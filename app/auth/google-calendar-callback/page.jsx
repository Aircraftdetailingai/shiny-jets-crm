'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function GoogleCalendarCallbackPage() {
  const [status, setStatus] = useState('Connecting Google Calendar...');
  const [error, setError] = useState(null);

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) { fail('Auth service unavailable'); return; }

      // Exchange the code (Supabase handles PKCE)
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          // Code may already be consumed — try existing session
          const { data: s } = await supabase.auth.getSession();
          if (!s?.session) { fail('Code exchange failed: ' + exchangeError.message); return; }
        }
      }

      // Get session — it has the Google provider_token
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) { fail('No session after authentication'); return; }

      const providerToken = session.provider_token;
      if (!providerToken) {
        fail('No Google access token received. Please try again.');
        return;
      }

      setStatus('Fetching your calendars...');

      // Test the token by fetching calendar list
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', {
        headers: { Authorization: `Bearer ${providerToken}` },
      });

      if (!calRes.ok) {
        const err = await calRes.json().catch(() => ({}));
        fail(err.error?.message || `Calendar API error: ${calRes.status}`);
        return;
      }

      const calData = await calRes.json();
      const calendars = (calData.items || []).map(c => ({
        id: c.id,
        summary: c.summary,
        primary: c.primary || false,
      }));

      setStatus('Saving connection...');

      // Save to our backend
      const token = localStorage.getItem('vector_token');
      const saveRes = await fetch('/api/google-calendar/save-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          access_token: providerToken,
          refresh_token: session.provider_refresh_token || null,
          email: session.user?.email,
          calendars,
        }),
      });

      if (!saveRes.ok) {
        const d = await saveRes.json().catch(() => ({}));
        fail(d.error || 'Failed to save connection');
        return;
      }

      // Success — redirect to integrations
      window.location.href = '/settings/integrations?gcal=success';
    } catch (err) {
      fail(err.message);
    }
  }

  function fail(msg) {
    setError(msg);
    setTimeout(() => {
      window.location.href = '/settings/integrations?gcal=error&message=' + encodeURIComponent(msg);
    }, 2000);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0D1B2A', color: 'white', flexDirection: 'column' }}>
      {!error && <div style={{ width: 32, height: 32, border: '2px solid #007CB1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 16 }} />}
      <p style={{ fontSize: 14, color: error ? '#f87171' : '#9ca3af' }}>
        {error || status}
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
