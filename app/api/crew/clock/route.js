import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

// GET - Get current clock status
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  // Check for open time entry (clocked in but not out)
  const { data: openEntry } = await supabase
    .from('time_entries')
    .select('id, date, clock_in, notes')
    .eq('team_member_id', user.id)
    .eq('date', today)
    .is('clock_out', null)
    .not('clock_in', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get today's total hours
  const { data: todayEntries } = await supabase
    .from('time_entries')
    .select('hours_worked')
    .eq('team_member_id', user.id)
    .eq('date', today);

  const todayHours = (todayEntries || []).reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);

  return Response.json({
    clocked_in: !!openEntry,
    clock_in_time: openEntry?.clock_in || null,
    entry_id: openEntry?.id || null,
    today_hours: todayHours,
  });
}

// POST - Clock in or clock out
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, quote_id, notes } = await request.json();
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  if (action === 'clock_in') {
    // Check if already clocked in
    const { data: existing } = await supabase
      .from('time_entries')
      .select('id')
      .eq('team_member_id', user.id)
      .eq('date', today)
      .is('clock_out', null)
      .not('clock_in', 'is', null)
      .maybeSingle();

    if (existing) {
      return Response.json({ error: 'Already clocked in' }, { status: 400 });
    }

    // Create new time entry with clock_in timestamp
    let entry = {
      team_member_id: user.id,
      detailer_id: user.detailer_id,
      date: today,
      clock_in: now,
      hours_worked: 0,
      quote_id: quote_id || null,
      notes: notes || null,
    };

    // Column-stripping retry
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from('time_entries')
        .insert(entry)
        .select('id, clock_in')
        .single();

      if (!error) {
        return Response.json({ success: true, clocked_in: true, entry_id: data.id, clock_in: data.clock_in });
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
    // Find open entry
    const { data: openEntry } = await supabase
      .from('time_entries')
      .select('id, clock_in')
      .eq('team_member_id', user.id)
      .eq('date', today)
      .is('clock_out', null)
      .not('clock_in', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!openEntry) {
      return Response.json({ error: 'Not clocked in' }, { status: 400 });
    }

    // Calculate hours worked
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
        return Response.json({ success: true, clocked_in: false, hours_worked: hoursWorked });
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

  return Response.json({ error: 'Invalid action. Use clock_in or clock_out.' }, { status: 400 });
}
