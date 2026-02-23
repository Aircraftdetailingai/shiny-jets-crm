import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendSms } from '@/lib/sms';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, plan, sms_enabled, twilio_phone')
    .eq('id', user.id)
    .single();

  if (detailer?.plan !== 'business') {
    return Response.json({ error: 'SMS requires Business plan' }, { status: 403 });
  }

  if (detailer?.sms_enabled === false) {
    return Response.json({ error: 'SMS is disabled in your settings' }, { status: 403 });
  }

  const { to, body } = await request.json();

  if (!to || !body) {
    return Response.json({ error: 'to and body are required' }, { status: 400 });
  }

  const result = await sendSms({ to, body, from: detailer.twilio_phone || undefined });

  return Response.json(result, { status: result.success ? 200 : 500 });
}
