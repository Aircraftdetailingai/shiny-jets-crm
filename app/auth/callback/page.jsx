'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function AuthCallbackPage() {
  const [status, setStatus] = useState('Signing you in...');
  const [error, setError] = useState(null);

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        fail('Supabase client not available');
        return;
      }

      // Get the code from the URL
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const errorParam = url.searchParams.get('error');
      const errorDesc = url.searchParams.get('error_description');

      // Check for OAuth errors from provider
      if (errorParam) {
        fail(errorDesc || errorParam);
        return;
      }

      let session = null;

      if (code) {
        // Exchange the PKCE code for a session
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          // If code was already used, try getting existing session
          const { data: existing } = await supabase.auth.getSession();
          session = existing?.session;
          if (!session) {
            fail('Code exchange failed: ' + exchangeError.message);
            return;
          }
        } else {
          session = data?.session;
        }
      } else {
        // No code — check for existing session (hash-based flow)
        const { data } = await supabase.auth.getSession();
        session = data?.session;
      }

      if (!session?.user?.email) {
        fail('No session after authentication');
        return;
      }

      setStatus('Setting up your account...');

      const email = session.user.email.toLowerCase().trim();
      const name = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';

      // Call our backend to get/create detailer + issue JWT
      const res = await fetch('/api/auth/oauth-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          provider: session.user.app_metadata?.provider || 'google',
          oauth_id: session.user.id,
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok || !result.token) {
        fail(result.error || 'Failed to complete sign in');
        return;
      }

      // Store auth
      localStorage.setItem('vector_token', result.token);
      localStorage.setItem('vector_user', JSON.stringify(result.user));
      document.cookie = `auth_token=${result.token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;

      // Wait for storage to persist
      await new Promise(r => setTimeout(r, 150));

      // Hard navigate
      window.location.href = result.redirect || '/dashboard';
    } catch (err) {
      fail(err.message || 'Unexpected error');
    }
  }

  function fail(msg) {
    console.error('[auth/callback]', msg);
    setError(msg);
    setTimeout(() => {
      window.location.href = '/login?error=auth_failed&message=' + encodeURIComponent(msg);
    }, 1500);
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
