import { createClient } from '@supabase/supabase-js';
import { createPortalToken } from '@/lib/portal-customer-auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return Response.redirect(new URL('/portal/login?error=invalid', request.url));
  }

  const supabase = getSupabase();

  // Find account by magic token
  const { data: account } = await supabase
    .from('customer_accounts')
    .select('*')
    .eq('magic_token', token)
    .maybeSingle();

  if (!account) {
    return Response.redirect(new URL('/portal/login?error=expired', request.url));
  }

  // Check expiry
  if (account.magic_token_expires && new Date(account.magic_token_expires) < new Date()) {
    return Response.redirect(new URL('/portal/login?error=expired', request.url));
  }

  // Clear magic token and update last_login
  let updates = { magic_token: null, magic_token_expires: null, last_login: new Date().toISOString() };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.from('customer_accounts').update(updates).eq('id', account.id);
    if (!error) break;
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) { delete updates[colMatch[1]]; continue; }
    break;
  }

  // Create JWT
  const jwt = await createPortalToken({
    customer_id: account.id,
    email: account.email,
    name: account.name,
  });

  // Set cookie
  const cookieStore = await cookies();
  cookieStore.set('portal_token', jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  // Redirect based on onboarding status
  const destination = account.onboarding_complete ? '/portal' : '/portal/onboarding';
  return Response.redirect(new URL(destination, request.url));
}
