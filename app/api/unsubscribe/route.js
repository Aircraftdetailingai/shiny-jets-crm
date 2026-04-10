import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) return Response.json({ error: 'Email required' }, { status: 400 });

    const supabase = getSupabase();
    const normalized = email.toLowerCase().trim();

    // Try to mark detailer as unsubscribed (column-stripping retry)
    const { error } = await supabase
      .from('detailers')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('email', normalized);

    // Always log the unsubscribe attempt to email_unsubscribes for non-detailer emails
    try {
      await supabase.from('email_unsubscribes').insert({ email: normalized });
    } catch {}

    if (error && !error.message?.includes('does not exist')) {
      console.error('[unsubscribe] DB error:', error.message);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('[unsubscribe] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// One-click unsubscribe via List-Unsubscribe header (RFC 8058)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  if (email) {
    try {
      const supabase = getSupabase();
      await supabase.from('detailers').update({ unsubscribed_at: new Date().toISOString() }).eq('email', email.toLowerCase().trim());
      try { await supabase.from('email_unsubscribes').insert({ email: email.toLowerCase().trim() }); } catch {}
    } catch {}
  }
  return Response.json({ success: true });
}
