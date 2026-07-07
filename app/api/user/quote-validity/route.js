import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { MIN_VALIDITY_DAYS, MAX_VALIDITY_DAYS } from '@/lib/quote-validity';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// POST { days } - set the detailer's default quote validity window (1-90 days).
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { days } = await request.json();
  const n = parseInt(days, 10);
  if (!Number.isInteger(n) || n < MIN_VALIDITY_DAYS || n > MAX_VALIDITY_DAYS) {
    return new Response(JSON.stringify({ error: `Validity must be an integer between ${MIN_VALIDITY_DAYS} and ${MAX_VALIDITY_DAYS} days` }), { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('detailers')
    .update({ default_quote_validity_days: n })
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update default quote validity:', error.message);
    return new Response(JSON.stringify({ error: 'Failed to update quote validity' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true, default_quote_validity_days: n }), { status: 200 });
}
