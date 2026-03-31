'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState('Signing you in...');

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      console.log('[auth/callback] START — client-side PKCE exchange');

      // Step 1: Let Supabase handle the code exchange (it has the PKCE verifier in the browser)
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        console.error('[auth/callback] FAIL — no Supabase client');
        router.replace('/login?error=auth_failed');
        return;
      }

      // Supabase auto-detects the code in the URL hash/params and exchanges it
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[auth/callback] Session error:', sessionError.message);
        router.replace('/login?error=auth_failed');
        return;
      }

      if (!session?.user) {
        console.error('[auth/callback] No session user after exchange');
        // Try exchanging manually if getSession didn't pick it up
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
          console.log('[auth/callback] Trying manual code exchange...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error || !data?.session?.user) {
            console.error('[auth/callback] Manual exchange failed:', error?.message);
            router.replace('/login?error=auth_failed');
            return;
          }
          await finishLogin(data.session.user);
          return;
        }
        router.replace('/login?error=auth_failed');
        return;
      }

      await finishLogin(session.user);
    } catch (err) {
      console.error('[auth/callback] Unexpected error:', err.message);
      router.replace('/login?error=server_error');
    }
  }

  async function finishLogin(oauthUser) {
    const email = oauthUser.email?.toLowerCase()?.trim();
    const fullName = oauthUser.user_metadata?.full_name || oauthUser.user_metadata?.name || email?.split('@')[0] || '';
    const provider = oauthUser.app_metadata?.provider || 'google';

    console.log('[auth/callback] OAuth user:', { email, fullName, provider });
    setStatus('Setting up your account...');

    if (!email) {
      router.replace('/login?error=no_email');
      return;
    }

    // Call our API to handle detailer lookup/creation and JWT issuance
    const res = await fetch('/api/auth/oauth-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: fullName,
        provider,
        oauth_id: oauthUser.id,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error('[auth/callback] oauth-complete failed:', data.error);
      const errMsg = encodeURIComponent(data.error || 'Account creation failed');
      router.replace(`/login?error=oauth_error&message=${errMsg}`);
      return;
    }

    const { token, user, redirect } = await res.json();

    // Store auth in localStorage
    localStorage.setItem('vector_token', token);
    localStorage.setItem('vector_user', JSON.stringify(user));

    console.log('[auth/callback] SUCCESS — redirecting to:', redirect);
    router.replace(redirect);
  }

  return (
    <div className="min-h-screen bg-v-charcoal flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-v-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-v-text-secondary text-sm">{status}</p>
      </div>
    </div>
  );
}
