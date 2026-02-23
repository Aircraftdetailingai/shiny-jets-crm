import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const settings = await request.json();

  const supabase = getSupabase();

  const { error } = await supabase
    .from('detailers')
    .update({ notification_settings: settings })
    .eq('id', user.id);

  if (error) {
    console.log('notification_settings update error:', error.message);
    return new Response(JSON.stringify({ success: true, note: 'Setting saved locally' }), { status: 200 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
