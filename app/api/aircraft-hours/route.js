import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET — look up aircraft hours by make+model
export async function GET(request) {
  const url = new URL(request.url);
  const make = url.searchParams.get('make');
  const model = url.searchParams.get('model');

  if (!make || !model) {
    return Response.json({ error: 'make and model are required' }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  // Try exact match first
  let { data, error } = await supabase
    .from('aircraft_hours')
    .select('*')
    .ilike('make', make.trim())
    .ilike('model', model.trim())
    .limit(1)
    .single();

  // If no exact match, try fuzzy match on model
  if (error || !data) {
    const { data: fuzzy } = await supabase
      .from('aircraft_hours')
      .select('*')
      .ilike('make', make.trim())
      .ilike('model', `%${model.trim()}%`)
      .limit(1);

    data = fuzzy?.[0] || null;
  }

  if (!data) {
    return Response.json({ hours: null });
  }

  return Response.json({ hours: data });
}
