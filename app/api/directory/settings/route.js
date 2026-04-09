import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = getSupabase();

  const updates = {};
  if (body.listed_in_directory !== undefined) updates.listed_in_directory = !!body.listed_in_directory;
  if (body.has_online_booking !== undefined) updates.has_online_booking = !!body.has_online_booking;
  if (body.airports_served !== undefined) updates.airports_served = body.airports_served;
  if (body.directory_description !== undefined) updates.directory_description = (body.directory_description || '').slice(0, 200);
  if (body.certifications !== undefined) updates.certifications = body.certifications;

  if (Object.keys(updates).length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });

  const { error } = await supabase.from('detailers').update(updates).eq('id', user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true });
}
