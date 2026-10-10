import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { isOpenShift, validateShiftClose } from '@/lib/labor-summary';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// POST { entry_id, clock_out, confirm_long_shift? }
// Close one open shift for this shop. Hours are computed from clock-in to the
// given clock-out and then count toward payroll. A forgotten multi-day punch
// cannot be closed by picking "now".
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'team', { user: user });
  if (planGate) return planGate;
  const detailerId = user.detailer_id || user.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const entryId = body?.entry_id;
  const clockOut = body?.clock_out;
  if (!entryId || !clockOut) {
    return Response.json({ error: 'entry_id and clock_out are required' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: entry, error: entryErr } = await supabase
    .from('time_entries')
    .select('id, team_member_id, detailer_id, clock_in, clock_out, date')
    .eq('id', entryId)
    .maybeSingle();

  if (entryErr) {
    console.error('[open-entries] load error:', entryErr.message);
    return Response.json({ error: 'Failed to close shift' }, { status: 500 });
  }
  if (!entry || !isOpenShift(entry)) {
    return Response.json({ error: 'Open shift not found' }, { status: 404 });
  }
  if (entry.detailer_id && entry.detailer_id !== detailerId) {
    return Response.json({ error: 'Open shift not found' }, { status: 404 });
  }

  const { data: member, error: memberErr } = await supabase
    .from('team_members')
    .select('id, detailer_id, name')
    .eq('id', entry.team_member_id)
    .eq('detailer_id', detailerId)
    .maybeSingle();

  if (memberErr) {
    console.error('[open-entries] member error:', memberErr.message);
    return Response.json({ error: 'Failed to close shift' }, { status: 500 });
  }
  if (!member) {
    return Response.json({ error: 'Open shift not found' }, { status: 404 });
  }

  const check = validateShiftClose({
    clockIn: entry.clock_in,
    clockOut,
    confirmLongShift: !!body.confirm_long_shift,
  });
  if (!check.ok) {
    return Response.json({ error: check.error, code: check.code || null, hours: check.hours || null }, { status: 400 });
  }

  const closedAt = new Date(clockOut).toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('time_entries')
    .update({ clock_out: closedAt, hours_worked: check.hours })
    .eq('id', entry.id)
    .eq('team_member_id', member.id)
    .is('clock_out', null)
    .select('id, clock_out, hours_worked, date, team_member_id')
    .maybeSingle();

  if (updateErr) {
    console.error('[open-entries] update error:', updateErr.message);
    return Response.json({ error: 'Failed to close shift' }, { status: 500 });
  }
  if (!updated) {
    return Response.json({ error: 'That shift was already closed' }, { status: 409 });
  }

  return Response.json({
    success: true,
    entry: updated,
    hours_worked: check.hours,
    member_name: member.name,
  });
}
