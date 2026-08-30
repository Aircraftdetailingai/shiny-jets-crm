import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendBetaInviteEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
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

// GET — list prospects with filters
export async function GET(request) {
  if (!await isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
  const offset = Number(url.searchParams.get('offset') || 0);

  let query = supabase.from('prospects').select('*', { count: 'exact' });

  if (state) query = query.eq('state', state.toUpperCase());
  if (status) query = query.eq('status', status);
  if (search) {
    query = query.or(`airport_name.ilike.%${search}%,fbo_name.ilike.%${search}%,city.ilike.%${search}%,icao.ilike.%${search}%`);
  }

  query = query.order('state').order('airport_name').range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Also get aggregate stats
  const { data: stats } = await supabase.rpc('get_prospect_stats');

  // If RPC doesn't exist, compute manually
  let statsObj = stats;
  if (!statsObj) {
    const { data: all } = await supabase.from('prospects').select('status, state');
    const allProspects = all || [];
    const stateCounts = {};
    let invited = 0, signedUp = 0;
    for (const p of allProspects) {
      if (p.status === 'invited') invited++;
      if (p.status === 'signed_up') signedUp++;
      stateCounts[p.state] = (stateCounts[p.state] || 0) + 1;
    }
    const topState = Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0];
    statsObj = {
      total: allProspects.length,
      invited,
      signed_up: signedUp,
      top_state: topState ? topState[0] : null,
      top_state_count: topState ? topState[1] : 0,
    };
  }

  // Get distinct states for filter dropdown
  const { data: statesData } = await supabase.from('prospects').select('state').not('state', 'is', null);
  const states = [...new Set((statesData || []).map(s => s.state).filter(Boolean))].sort();

  return Response.json({ prospects: data || [], total: count || 0, stats: statsObj, states });
}

// POST — bulk invite selected prospects
export async function POST(request) {
  if (!await isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const { prospect_ids, plan, duration_days } = await request.json();

  if (!prospect_ids?.length) return Response.json({ error: 'No prospects selected' }, { status: 400 });
  if (!['pro', 'business'].includes(plan)) return Response.json({ error: 'Invalid plan' }, { status: 400 });
  if (![30, 60, 90].includes(Number(duration_days))) return Response.json({ error: 'Invalid duration' }, { status: 400 });

  // Fetch selected prospects
  const { data: prospects, error: fetchErr } = await supabase
    .from('prospects')
    .select('*')
    .in('id', prospect_ids)
    .eq('status', 'new');

  if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 });

  const results = { sent: 0, skipped: 0, errors: [] };

  for (const prospect of (prospects || [])) {
    if (!prospect.email) {
      results.skipped++;
      continue;
    }

    const token = crypto.randomUUID();

    // Create invite
    const { data: invite, error: invErr } = await supabase
      .from('beta_invites')
      .insert({
        email: prospect.email.toLowerCase().trim(),
        token,
        plan,
        duration_days: Number(duration_days),
        note: `Auto-invited from prospect: ${prospect.airport_name || ''} ${prospect.fbo_name || ''}`.trim(),
      })
      .select()
      .single();

    if (invErr) {
      results.errors.push(`${prospect.email}: ${invErr.message}`);
      continue;
    }

    // Send email
    const emailResult = await sendBetaInviteEmail({
      email: prospect.email,
      plan,
      durationDays: Number(duration_days),
      token,
    });

    if (!emailResult.success) {
      results.errors.push(`${prospect.email}: email failed`);
    }

    // Update prospect status
    await supabase
      .from('prospects')
      .update({ status: 'invited', invited_at: new Date().toISOString(), invite_id: invite.id })
      .eq('id', prospect.id);

    results.sent++;
  }

  return Response.json({ results });
}
