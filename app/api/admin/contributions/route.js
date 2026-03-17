import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
  'brett@vectorav.ai',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

// GET - List contributions with optional filters
export async function GET(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const make = searchParams.get('make');
    const model = searchParams.get('model');
    const accepted = searchParams.get('accepted');

    let query = supabase
      .from('hours_contributions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (make) query = query.ilike('make', make);
    if (model) query = query.ilike('model', model);
    if (accepted === 'true') query = query.eq('accepted', true);
    else if (accepted === 'false') query = query.eq('accepted', false);
    else if (accepted === 'pending') query = query.is('accepted', null);

    const { data: contributions, error } = await query;

    if (error) {
      console.error('Contributions query error:', error);
      return Response.json({ error: 'Failed to fetch contributions' }, { status: 500 });
    }

    // Aggregate stats
    const total = contributions?.length || 0;
    const pendingCount = (contributions || []).filter(c => c.accepted === null).length;
    const acceptedCount = (contributions || []).filter(c => c.accepted === true).length;

    // Group by aircraft
    const byAircraft = {};
    for (const c of (contributions || [])) {
      const key = `${c.make} ${c.model}`;
      byAircraft[key] = (byAircraft[key] || 0) + 1;
    }

    return Response.json({
      contributions: contributions || [],
      stats: { total, pendingCount, acceptedCount, byAircraft },
    });
  } catch (err) {
    console.error('Contributions error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Accept or reject a contribution
export async function POST(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { id, accepted } = await request.json();
    if (!id || typeof accepted !== 'boolean') {
      return Response.json({ error: 'id and accepted (boolean) required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('hours_contributions')
      .update({ accepted })
      .eq('id', id);

    if (error) {
      console.error('Update contribution error:', error);
      return Response.json({ error: 'Failed to update' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Contribution update error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
