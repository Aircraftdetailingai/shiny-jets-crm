import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature, requireSeat } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const planGate = await requireFeature(request, 'team', { user: user });
    if (planGate) return planGate;

    const { id } = await params;

    const { data: member, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', id)
      .eq('detailer_id', user.detailer_id || user.id)
      .single();

    if (error || !member) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Get their time entries
    const { data: entries, error: entriesError } = await supabase
      .from('time_entries')
      .select('*')
      .eq('team_member_id', id)
      .order('date', { ascending: false });

    if (entriesError) {
      console.error('Time entries fetch error:', entriesError);
    }

    const timeEntries = entries || [];

    // Calculate pay period window
    const freq = member.pay_period_frequency || 'biweekly';
    const periodStart = member.pay_period_start ? new Date(member.pay_period_start + 'T00:00:00') : new Date(member.created_at);
    const now = new Date();
    let windowStart, windowEnd;

    if (freq === 'weekly') {
      // Find current week window anchored to pay_period_start
      const diffDays = Math.floor((now - periodStart) / 86400000);
      const weeksSince = Math.floor(diffDays / 7);
      windowStart = new Date(periodStart);
      windowStart.setDate(windowStart.getDate() + weeksSince * 7);
      windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + 7);
    } else if (freq === 'biweekly') {
      const diffDays = Math.floor((now - periodStart) / 86400000);
      const periodsSince = Math.floor(diffDays / 14);
      windowStart = new Date(periodStart);
      windowStart.setDate(windowStart.getDate() + periodsSince * 14);
      windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + 14);
    } else if (freq === 'semi_monthly') {
      const day = now.getDate();
      if (day <= 15) {
        windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
        windowEnd = new Date(now.getFullYear(), now.getMonth(), 16);
      } else {
        windowStart = new Date(now.getFullYear(), now.getMonth(), 16);
        windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      }
    } else {
      // monthly
      windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
      windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const windowStartStr = windowStart.toISOString().split('T')[0];
    const windowEndStr = windowEnd.toISOString().split('T')[0];

    const periodEntries = timeEntries.filter(e => e.date >= windowStartStr && e.date < windowEndStr);
    const totalHours = periodEntries.reduce((sum, e) => sum + parseFloat(e.hours_worked || 0), 0);
    const totalPay = totalHours * parseFloat(member.hourly_pay || 0);

    return Response.json({
      member,
      time_entries: timeEntries,
      stats: { total_hours: totalHours, total_pay: totalPay },
      pay_period: { start: windowStartStr, end: windowEndStr, frequency: freq },
    });

  } catch (err) {
    console.error('Team GET error:', err);
    return Response.json({ error: 'Failed to fetch team member' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const planGate = await requireFeature(request, 'team', { user: user });
    if (planGate) return planGate;

    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const { data: existing } = await supabase
      .from('team_members')
      .select('id, status, role')
      .eq('id', id)
      .eq('detailer_id', user.detailer_id || user.id)
      .single();

    if (!existing) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Re-activating a member takes a seat — enforce the plan's user cap.
    if (body.status === 'active' && existing.status !== 'active' && existing.role !== 'owner') {
      const seatGate = await requireSeat(supabase, user.detailer_id || user.id);
      if (seatGate) return seatGate;
    }

    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.type !== undefined) {
      if (!['employee', 'contractor'].includes(body.type)) {
        return Response.json({ error: 'Type must be employee or contractor' }, { status: 400 });
      }
      updates.type = body.type;
    }
    if (body.hourly_pay !== undefined) updates.hourly_pay = parseFloat(body.hourly_pay) || 0;
    if (body.status !== undefined) updates.status = body.status;
    if (body.pin_code !== undefined) updates.pin_code = body.pin_code;
    if (body.pay_period_frequency !== undefined) {
      const validFreqs = ['weekly', 'biweekly', 'semi_monthly', 'monthly'];
      if (validFreqs.includes(body.pay_period_frequency)) updates.pay_period_frequency = body.pay_period_frequency;
    }
    if (body.role !== undefined) {
      const validRoles = ['owner', 'manager', 'lead_tech', 'employee', 'contractor'];
      if (validRoles.includes(body.role)) updates.role = body.role;
    }

    // Column-stripping retry
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase
        .from('team_members')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (!error) return Response.json(data);

      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
      if (colMatch) { delete updates[colMatch[1]]; continue; }

      console.error('Team update error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ error: 'Update failed after retries' }, { status: 500 });

  } catch (err) {
    console.error('Team PATCH error:', err);
    return Response.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const planGate = await requireFeature(request, 'team', { user: user });
    if (planGate) return planGate;

    const { id } = await params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('id', id)
      .eq('detailer_id', user.detailer_id || user.id)
      .single();

    if (!existing) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Team delete error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('Team DELETE error:', err);
    return Response.json({ error: 'Failed to delete team member' }, { status: 500 });
  }
}
