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

// Fetch the display label for a job_id or quote_id (aircraft or customer name)
async function getJobLabel(supabase, { job_id, quote_id }) {
  if (job_id) {
    const { data } = await supabase
      .from('jobs')
      .select('id, aircraft_make, aircraft_model, tail_number, customer_name')
      .eq('id', job_id)
      .maybeSingle();
    if (data) {
      const aircraft = [data.aircraft_make, data.aircraft_model].filter(Boolean).join(' ');
      return aircraft || data.tail_number || data.customer_name || 'Job';
    }
  }
  if (quote_id) {
    const { data } = await supabase
      .from('quotes')
      .select('id, aircraft_model, aircraft_type, client_name, tail_number')
      .eq('id', quote_id)
      .maybeSingle();
    if (data) {
      return data.aircraft_model || data.aircraft_type || data.tail_number || data.client_name || 'Quote';
    }
  }
  return null;
}

// GET - Current clock status (includes current job/aircraft)
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  // Check for open time entry — try with job_id column first, fall back if missing
  let openEntry = null;
  try {
    const result = await supabase
      .from('time_entries')
      .select('id, date, clock_in, notes, quote_id, job_id')
      .eq('team_member_id', user.id)
      .eq('date', today)
      .is('clock_out', null)
      .not('clock_in', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    openEntry = result.data;
  } catch {}

  if (!openEntry) {
    // Fallback: query without job_id column
    const { data } = await supabase
      .from('time_entries')
      .select('id, date, clock_in, notes, quote_id')
      .eq('team_member_id', user.id)
      .eq('date', today)
      .is('clock_out', null)
      .not('clock_in', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    openEntry = data;
  }

  // Today's total hours
  const { data: todayEntries } = await supabase
    .from('time_entries')
    .select('hours_worked')
    .eq('team_member_id', user.id)
    .eq('date', today);
  const todayHours = (todayEntries || []).reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);

  // Resolve current job label if clocked in
  let currentJobLabel = null;
  if (openEntry) {
    currentJobLabel = await getJobLabel(supabase, {
      job_id: openEntry.job_id,
      quote_id: openEntry.quote_id,
    });
  }

  return Response.json({
    clocked_in: !!openEntry,
    clock_in_time: openEntry?.clock_in || null,
    entry_id: openEntry?.id || null,
    current_job_id: openEntry?.job_id || null,
    current_quote_id: openEntry?.quote_id || null,
    current_job_label: currentJobLabel,
    today_hours: todayHours,
  });
}

// Helper: insert a new open time entry with column-stripping retry
async function insertEntry(supabase, entry) {
  let working = { ...entry };
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('time_entries')
      .insert(working)
      .select('id, clock_in')
      .single();
    if (!error) return { data };
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      delete working[colMatch[1]];
      continue;
    }
    return { error };
  }
  return { error: { message: 'Failed after retries' } };
}

// Helper: close an open time entry (set clock_out + hours_worked)
async function closeEntry(supabase, entry_id, closedAt) {
  // Fetch clock_in to calculate hours
  const { data: entry } = await supabase
    .from('time_entries')
    .select('clock_in')
    .eq('id', entry_id)
    .single();
  if (!entry?.clock_in) return { error: { message: 'Entry not found' } };

  const clockIn = new Date(entry.clock_in);
  const clockOut = new Date(closedAt);
  const hoursWorked = Math.round(((clockOut - clockIn) / (1000 * 60 * 60)) * 100) / 100;

  const { error } = await supabase
    .from('time_entries')
    .update({ clock_out: closedAt, hours_worked: hoursWorked })
    .eq('id', entry_id);

  return { hoursWorked, error };
}

// POST - clock_in | clock_out | switch
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { action, job_id, quote_id, notes } = await request.json();
  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // Find current open entry (if any)
  async function findOpenEntry() {
    const { data } = await supabase
      .from('time_entries')
      .select('id, clock_in')
      .eq('team_member_id', user.id)
      .eq('date', today)
      .is('clock_out', null)
      .not('clock_in', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  if (action === 'clock_in') {
    const existing = await findOpenEntry();
    if (existing) {
      return Response.json({ error: 'Already clocked in. Use "switch" to change jobs.' }, { status: 400 });
    }

    console.log('[crew/clock] clock_in attempt:', { user_id: user.id, detailer_id: user.detailer_id, job_id, quote_id });

    const entry = {
      team_member_id: user.id,
      detailer_id: user.detailer_id,
      date: today,
      clock_in: now,
      hours_worked: 0,
      notes: notes || null,
    };
    // Set job_id or quote_id — the crew page may send the job under either field
    if (job_id) entry.job_id = job_id;
    if (quote_id) entry.quote_id = quote_id;

    const { data, error } = await insertEntry(supabase, entry);
    if (error) {
      console.error('[crew/clock] clock_in error:', error.message, '| entry:', JSON.stringify(entry));
      return Response.json({ error: 'Failed to clock in: ' + (error.message || 'Unknown error') }, { status: 500 });
    }

    const label = await getJobLabel(supabase, { job_id, quote_id });
    return Response.json({
      success: true,
      clocked_in: true,
      entry_id: data.id,
      clock_in: data.clock_in,
      job_label: label,
    });
  }

  if (action === 'switch') {
    const existing = await findOpenEntry();
    if (!existing) {
      return Response.json({ error: 'Not clocked in — use clock_in instead' }, { status: 400 });
    }
    if (!job_id && !quote_id) {
      return Response.json({ error: 'job_id or quote_id required to switch' }, { status: 400 });
    }

    // Close current entry at the switch timestamp
    const { hoursWorked, error: closeErr } = await closeEntry(supabase, existing.id, now);
    if (closeErr) {
      console.error('[crew/clock] switch close error:', closeErr.message);
      return Response.json({ error: 'Failed to close current entry' }, { status: 500 });
    }

    // Open a new entry on the new job at the same timestamp (no gap)
    const entry = {
      team_member_id: user.id,
      detailer_id: user.detailer_id,
      date: today,
      clock_in: now,
      hours_worked: 0,
      job_id: job_id || null,
      quote_id: quote_id || null,
      notes: notes || null,
    };
    const { data: newEntry, error: insertErr } = await insertEntry(supabase, entry);
    if (insertErr) {
      console.error('[crew/clock] switch insert error:', insertErr.message);
      return Response.json({ error: 'Failed to start new entry' }, { status: 500 });
    }

    const label = await getJobLabel(supabase, { job_id, quote_id });
    return Response.json({
      success: true,
      switched: true,
      closed_entry_id: existing.id,
      closed_hours: hoursWorked,
      entry_id: newEntry.id,
      clock_in: newEntry.clock_in,
      job_label: label,
    });
  }

  if (action === 'clock_out') {
    const existing = await findOpenEntry();
    if (!existing) {
      return Response.json({ error: 'Not clocked in' }, { status: 400 });
    }

    const { hoursWorked, error } = await closeEntry(supabase, existing.id, now);
    if (error) {
      console.error('[crew/clock] clock_out error:', error.message);
      return Response.json({ error: 'Failed to clock out' }, { status: 500 });
    }

    // Get label for the entry we just closed so the UI can show a summary
    const { data: closedEntry } = await supabase
      .from('time_entries')
      .select('job_id, quote_id')
      .eq('id', existing.id)
      .single();
    const label = closedEntry
      ? await getJobLabel(supabase, { job_id: closedEntry.job_id, quote_id: closedEntry.quote_id })
      : null;

    // Non-blocking overrun check after successful clock-out with a job
    if (closedEntry?.job_id) {
      try {
        const origin = new URL(request.url).origin;
        fetch(`${origin}/api/jobs/${closedEntry.job_id}/check-overrun`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': request.headers.get('authorization') || '',
          },
        }).catch(() => {});
      } catch {
        // Never break the clock-out flow
      }
    }

    return Response.json({
      success: true,
      clocked_in: false,
      hours_worked: hoursWorked,
      job_label: label,
    });
  }

  if (action === 'adjust_clock_in') {
    // Adjust the clock_in time on the current open entry
    const { new_clock_in, entry_id } = await request.json().catch(() => ({}));
    if (!entry_id || !new_clock_in) {
      return Response.json({ error: 'entry_id and new_clock_in required' }, { status: 400 });
    }
    const { error: adjErr } = await supabase
      .from('time_entries')
      .update({ clock_in: new_clock_in })
      .eq('id', entry_id)
      .eq('team_member_id', user.id);
    if (adjErr) {
      console.error('[crew/clock] adjust error:', adjErr.message);
      return Response.json({ error: 'Failed to adjust' }, { status: 500 });
    }
    return Response.json({ success: true, adjusted: true });
  }

  if (action === 'manual_entry') {
    // Create a complete time entry (both clock_in and clock_out set)
    const { clock_in: manualIn, clock_out: manualOut, job_id: manualJobId, quote_id: manualQuoteId, date: manualDate } = await request.json().catch(() => ({}));
    if (!manualIn || !manualOut) {
      return Response.json({ error: 'clock_in and clock_out required' }, { status: 400 });
    }
    const start = new Date(manualIn);
    const end = new Date(manualOut);
    const hoursWorked = Math.round(((end - start) / (1000 * 60 * 60)) * 100) / 100;
    if (hoursWorked <= 0) {
      return Response.json({ error: 'End time must be after start time' }, { status: 400 });
    }

    const entry = {
      team_member_id: user.id,
      detailer_id: user.detailer_id,
      date: manualDate || start.toISOString().split('T')[0],
      clock_in: start.toISOString(),
      clock_out: end.toISOString(),
      hours_worked: hoursWorked,
      job_id: manualJobId || null,
      quote_id: manualQuoteId || null,
      notes: 'Manual entry',
    };
    const { data: inserted, error: insertErr } = await insertEntry(supabase, entry);
    if (insertErr) {
      console.error('[crew/clock] manual_entry error:', insertErr.message);
      return Response.json({ error: 'Failed to create entry' }, { status: 500 });
    }
    return Response.json({ success: true, entry_id: inserted.id, hours_worked: hoursWorked });
  }

  return Response.json({ error: 'Invalid action. Use clock_in, switch, clock_out, adjust_clock_in, or manual_entry.' }, { status: 400 });
}
