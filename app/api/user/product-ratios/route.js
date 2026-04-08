import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = getSupabase();

  try {
    const { data, error } = await supabase
      .from('product_ratios')
      .select('ratios')
      .eq('detailer_id', user.id)
      .maybeSingle();

    if (error) {
      // Table might not exist or other DB error — return empty gracefully
      console.log('Product ratios fetch:', error.message);
      return new Response(JSON.stringify({ ratios: null }), { status: 200 });
    }

    return new Response(JSON.stringify({ ratios: data?.ratios || null }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ ratios: null }), { status: 200 });
  }
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { ratios } = await request.json();

  if (!ratios || typeof ratios !== 'object') {
    return new Response(JSON.stringify({ error: 'Invalid ratios' }), { status: 400 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('product_ratios')
    .upsert({
      detailer_id: user.id,
      ratios,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'detailer_id' });

  if (error) {
    console.error('Failed to save product ratios:', error);
    return new Response(JSON.stringify({ error: 'Failed to save product ratios' }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
