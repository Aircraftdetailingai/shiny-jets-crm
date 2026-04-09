import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return Response.json({ error: 'No file' }, { status: 400 });

  const supabase = getSupabase();
  const ext = file.name.split('.').pop();
  const path = `detailer-insurance/${user.id}/coi.${ext}`;

  const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path);
  const url = urlData?.publicUrl;

  await supabase.from('detailers').update({ insurance_url: url }).eq('id', user.id);

  return Response.json({ success: true, url });
}
