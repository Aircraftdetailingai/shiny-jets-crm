import { createClient } from '@supabase/supabase-js';
import { createToken } from '@/lib/auth';
import { readBearerToken } from '@/lib/oauth-identity';
import { completeOAuthSession } from '@/lib/oauth-complete-session';
import { jsonWithAuthCookie } from '@/lib/auth-cookie';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  try {
    // Identity is the Supabase access token, validated by auth.getUser.
    // The JSON body is ignored: it used to carry email and oauth_id, and
    // this route minted a CRM JWT for whatever account that email matched.
    const accessToken = readBearerToken(request.headers.get('authorization'));
    const supabase = getSupabase();
    const result = await completeOAuthSession({ supabase, accessToken, createToken });
    if (result.status === 200 && result.body?.token) {
      return jsonWithAuthCookie(result.body, result.body.token, result.status);
    }
    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[oauth-complete] Error:', err.message);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
