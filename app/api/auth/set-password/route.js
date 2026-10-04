import { createClient } from '@supabase/supabase-js';
import { comparePassword, createToken, getAuthUser, hashPassword, setSessionCookie } from '@/lib/auth';
import { applySetPassword } from '@/lib/password-change';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  try {
    const sessionUser = await getAuthUser(request);
    if (!sessionUser?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const supabase = getSupabase();
    const result = await applySetPassword({
      sessionUser,
      body,
      fetchAccount: async (id) => {
        const { data, error } = await supabase
          .from('detailers')
          .select('id, email, password_hash, must_change_password, onboarding_complete, onboarding_completed')
          .eq('id', id)
          .maybeSingle();
        if (error) {
          console.error('[set-password] lookup failed:', error.message);
          return { error };
        }
        return { account: data };
      },
      savePassword: async (id, fields) => {
        const { error } = await supabase
          .from('detailers')
          .update({
            password_hash: fields.password_hash,
            must_change_password: false,
          })
          .eq('id', id);
        if (error) {
          console.error('[set-password] update failed:', error.message);
          return { ok: false };
        }
        return { ok: true };
      },
      comparePassword,
      hashPassword,
      createToken,
    });

    if (result.token) {
      try {
        await setSessionCookie(result.token);
      } catch {
        // The JSON token still lets the client replace localStorage.
      }
    }

    return Response.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[set-password]', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
