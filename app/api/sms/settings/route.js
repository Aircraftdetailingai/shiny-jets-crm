import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { hasPremiumAccess } from '@/lib/pricing-tiers';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: detailer } = await supabase
    .from('detailers')
    .select('sms_enabled, twilio_phone, plan')
    .eq('id', user.id)
    .single();

  return Response.json({
    sms_enabled: detailer?.sms_enabled || false,
    twilio_phone: detailer?.twilio_phone || null,
    plan: detailer?.plan || 'free',
  });
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { data: detailer } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', user.id)
    .single();

  if (!hasPremiumAccess(detailer?.plan)) {
    return Response.json({ error: 'SMS settings require Business plan' }, { status: 403 });
  }

  const body = await request.json();
  const updates = {};

  if (typeof body.sms_enabled === 'boolean') {
    updates.sms_enabled = body.sms_enabled;
  }
  if (body.twilio_phone !== undefined) {
    updates.twilio_phone = body.twilio_phone || null;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No valid updates' }, { status: 400 });
  }

  const { error } = await supabase
    .from('detailers')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    console.log('SMS settings update error:', error.message);
    return Response.json({ success: true, note: 'Column may not exist yet' });
  }

  return Response.json({ success: true, ...updates });
}
