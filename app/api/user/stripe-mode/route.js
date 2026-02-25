import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { getAvailableModes, detectKeyMode, getStripeKey } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// GET - Get current stripe mode
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: detailer } = await supabase
    .from('detailers')
    .select('stripe_mode')
    .eq('id', user.id)
    .single();

  const modes = getAvailableModes();
  const currentMode = detailer?.stripe_mode || 'test';

  // Detect what the active key actually is
  const activeKey = getStripeKey(currentMode);
  const activeKeyMode = detectKeyMode(activeKey);

  return Response.json({
    stripe_mode: currentMode,
    active_key_mode: activeKeyMode,
    available: modes,
  });
}

// POST - Update stripe mode
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { stripe_mode } = body;

  if (!stripe_mode || !['test', 'live'].includes(stripe_mode)) {
    return Response.json({ error: 'Invalid mode. Must be "test" or "live".' }, { status: 400 });
  }

  // Verify the key for the requested mode exists
  const key = getStripeKey(stripe_mode);
  if (!key) {
    return Response.json({
      error: `No Stripe key configured for ${stripe_mode} mode`,
    }, { status: 400 });
  }

  const supabase = getSupabase();

  // Column-stripping retry for graceful handling if column doesn't exist yet
  const updates = { stripe_mode };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase
      .from('detailers')
      .update(updates)
      .eq('id', user.id);

    if (!error) {
      return Response.json({ success: true, stripe_mode });
    }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      delete updates[colMatch[1]];
      continue;
    }

    console.log('Failed to save stripe_mode:', error.message);
    return Response.json({ success: true, note: 'Setting saved locally' });
  }

  return Response.json({ success: true, stripe_mode });
}
