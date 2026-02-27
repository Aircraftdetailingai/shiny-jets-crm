import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/quickbooks';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const realmId = searchParams.get('realmId');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vectorav.ai';

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?quickbooks=error&message=${encodeURIComponent(error)}`
    );
  }

  if (!code || !realmId) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?quickbooks=error&message=Missing+authorization+code`
    );
  }

  // Verify user is authenticated via cookie
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('auth_token')?.value;
  if (!authCookie) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?quickbooks=error&message=Not+authenticated`
    );
  }

  const user = await verifyToken(authCookie);
  if (!user) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?quickbooks=error&message=Invalid+session`
    );
  }

  // Verify state matches user ID (CSRF protection)
  if (state !== user.id) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?quickbooks=error&message=State+mismatch`
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const supabase = getSupabase();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error: dbError } = await supabase
      .from('quickbooks_connections')
      .upsert({
        detailer_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        realm_id: realmId,
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'detailer_id' });

    if (dbError) {
      console.error('QB token storage error:', dbError);
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?quickbooks=error&message=Failed+to+save+connection`
      );
    }

    return NextResponse.redirect(`${appUrl}/settings/integrations?quickbooks=success`);
  } catch (err) {
    console.error('QB callback error:', err);
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?quickbooks=error&message=${encodeURIComponent(err.message)}`
    );
  }
}
