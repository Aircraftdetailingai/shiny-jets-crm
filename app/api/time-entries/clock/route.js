import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// POST - PIN-based clock in/out
export async function POST(request) {
  const { pin_code, action, quote_id, notes } = await request.json();

  if (!pin_code || !action) {
    return Response.json({ error: 'pin_code and action required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify PIN — fetch ALL active matches (platform-wide) and never auto-pick.
  const { data: pinMembers, error: pinErr } = await supabase
    .from('team_members')
    .select('id, detailer_id, name, status')
    .eq('pin_code', pin_code)
    .eq('status', 'active');

  if (pinErr) {
    console.error('[time-entries/clock] PIN lookup failed:', pinErr.message);
    return Response.json({ error: 'Failed to verify PIN' }, { status: 500 });
  }
  const activeMembers = pinMembers || [];
  if (activeMembers.length === 0) {
    return Response.json({ error: 'Invalid PIN' }, { status: 401 });
  }
  if (activeMembers.length > 1) {
    return Response.json({ error: 'This PIN matches more than one worker. Contact your manager for a unique PIN.', code: 'pin_ambiguous' }, { status: 409 });
  }
  const member = activeMembers[0];

  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  if (action === 'clock_in') {
    // Check for ANY open entry (any date) — a prior-day open entry must block
    // a fresh clock-in so its hours don't leak.
    const { data: existing } = await supabase
      .from('time_entries')
      .select('id, date, clock_in')
      .eq('team_member_id', member.id)
      .is('clock_out', null)
      .not('clock_in', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const entryDate = existing.date || (existing.clock_in || '').split('T')[0];
      return Response.json({
        error: `You have an open time entry from ${entryDate} — clock out of it first`,
        code: 'open_entry_exists',
        open_entry_id: existing.id,
        open_entry_date: entryDate,
      }, { status: 400 });
    }

    let entry = {
      team_member_id: member.id,
      detailer_id: member.detailer_id,
      date: today,
      clock_in: now,
      hours_worked: 0,
      quote_id: quote_id || null,
      notes: notes || null,
      approved: false,
    };

    // Column-stripping retry
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('time_entries')
        .insert(entry)
        .select('id, clock_in')
        .single();

      if (!error) {
        return Response.json({
          success: true,
          clocked_in: true,
          entry_id: data.id,
          clock_in: data.clock_in,
          member_name: member.name,
        });
      }

      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
      if (colMatch) {
        delete entry[colMatch[1]];
        continue;
      }

      console.error('Clock in error:', error);
      return Response.json({ error: 'Failed to clock in' }, { status: 500 });
    }
  }

  if (action === 'clock_out') {
    const { data: openEntry } = await supabase
      .from('time_entries')
      .select('id, clock_in')
      .eq('team_member_id', member.id)
      .eq('date', today)
      .is('clock_out', null)
      .not('clock_in', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!openEntry) {
      return Response.json({ error: 'Not clocked in' }, { status: 400 });
    }

    const clockIn = new Date(openEntry.clock_in);
    const clockOut = new Date(now);
    const hoursWorked = Math.round(((clockOut - clockIn) / (1000 * 60 * 60)) * 100) / 100;

    let updates = { clock_out: now, hours_worked: hoursWorked };
    if (notes) updates.notes = notes;

    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase
        .from('time_entries')
        .update(updates)
        .eq('id', openEntry.id);

      if (!error) {
        return Response.json({
          success: true,
          clocked_in: false,
          hours_worked: hoursWorked,
          member_name: member.name,
        });
      }

      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
      if (colMatch) {
        delete updates[colMatch[1]];
        continue;
      }

      console.error('Clock out error:', error);
      return Response.json({ error: 'Failed to clock out' }, { status: 500 });
    }
  }

  if (action === 'status') {
    const { data: openEntry } = await supabase
      .from('time_entries')
      .select('id, clock_in')
      .eq('team_member_id', member.id)
      .eq('date', today)
      .is('clock_out', null)
      .not('clock_in', 'is', null)
      .maybeSingle();

    const { data: todayEntries } = await supabase
      .from('time_entries')
      .select('hours_worked')
      .eq('team_member_id', member.id)
      .eq('date', today);

    const todayHours = (todayEntries || []).reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);

    return Response.json({
      clocked_in: !!openEntry,
      clock_in_time: openEntry?.clock_in || null,
      entry_id: openEntry?.id || null,
      today_hours: todayHours,
      member_name: member.name,
    });
  }

  return Response.json({ error: 'Invalid action. Use clock_in, clock_out, or status.' }, { status: 400 });
}
