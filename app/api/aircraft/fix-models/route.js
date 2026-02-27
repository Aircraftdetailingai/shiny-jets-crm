import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = ['brett@aircraftdetailing.ai', 'admin@aircraftdetailing.ai', 'brett@shinyjets.com'];

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// One-time fix: strip ".0" suffix from ALL aircraft model names (Boeing, Bell, Cessna, etc.)
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
    return Response.json({ error: 'Admin only' }, { status: 403 });
  }

  const supabase = getSupabase();

  // Fetch all aircraft with model ending in .0
  const { data: allAircraft, error: fetchErr } = await supabase
    .from('aircraft')
    .select('id, manufacturer, model')
    .order('manufacturer')
    .order('model');

  if (fetchErr) {
    return Response.json({ error: fetchErr.message }, { status: 500 });
  }

  // Find models where the name is purely numeric with .0 suffix (e.g., "707.0" but not "G650.0")
  const toFix = (allAircraft || []).filter(a => a.model && /^\d+\.0$/.test(a.model));
  const results = [];

  for (const aircraft of toFix) {
    const newModel = aircraft.model.replace(/\.0$/, '');
    const { error: updateErr } = await supabase
      .from('aircraft')
      .update({ model: newModel })
      .eq('id', aircraft.id);

    results.push({
      manufacturer: aircraft.manufacturer,
      old: aircraft.model,
      new: newModel,
      success: !updateErr,
      error: updateErr?.message || null,
    });
  }

  return Response.json({
    totalAircraft: (allAircraft || []).length,
    fixed: results.length,
    results,
  });
}
