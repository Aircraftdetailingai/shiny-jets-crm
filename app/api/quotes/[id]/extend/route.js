import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// POST - Extend a quote's valid_until by N days (default 7)
export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { id } = params;

  const body = await request.json().catch(() => ({}));
  const days = parseInt(body.days) || 7;

  // Fetch the quote
  const { data: quote, error: fetchErr } = await supabase
    .from('quotes')
    .select('id, detailer_id, valid_until, status')
    .eq('id', id)
    .single();

  if (fetchErr || !quote) {
    return Response.json({ error: 'Quote not found' }, { status: 404 });
  }

  if (quote.detailer_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Calculate new expiry: extend from current valid_until or from now if already expired
  const currentExpiry = quote.valid_until ? new Date(quote.valid_until) : new Date();
  const base = currentExpiry > new Date() ? currentExpiry : new Date();
  const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  // If quote was expired, revert status to sent/viewed
  const updates = { valid_until: newExpiry };
  if (quote.status === 'expired') {
    updates.status = 'sent';
  }
  // Clear the warning flag so a new warning can be sent if applicable
  updates.expiration_warning_sent = null;

  const { data: updated, error: updateErr } = await supabase
    .from('quotes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    quote: updated,
    newExpiry,
    days,
  });
}
