import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { TERMS_VERSION } from '@/lib/terms';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Try with both columns first
    const { error } = await supabase
      .from('detailers')
      .update({
        terms_accepted_version: TERMS_VERSION,
        agreed_to_terms_at: now,
      })
      .eq('id', user.id);

    if (error) {
      console.error('Terms accept error (first attempt):', error.message);
      // Retry with just the version column (the critical one)
      const { error: retryError } = await supabase
        .from('detailers')
        .update({ terms_accepted_version: TERMS_VERSION })
        .eq('id', user.id);

      if (retryError) {
        console.error('Terms accept error (retry):', retryError.message);
        return Response.json({ error: retryError.message }, { status: 500 });
      }
    }

    return Response.json({ success: true, terms_version: TERMS_VERSION });
  } catch (err) {
    console.error('Terms accept error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
