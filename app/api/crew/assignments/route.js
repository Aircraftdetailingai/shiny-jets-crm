import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

async function getCrewUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

// GET — pending and accepted assignments for the crew member
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  // Fetch assignments with joined job data
  const { data, error } = await supabase
    .from('job_assignments')
    .select('id, job_id, team_member_id, detailer_id, status, accepted_at, declined_at, notified_at, notes, created_at')
    .eq('team_member_id', user.id)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[crew/assignments] GET error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate by job_id (keep the most recent assignment per job)
  const seenJobIds = new Set();
  const unique = [];
  for (const a of (data || [])) {
    if (seenJobIds.has(a.job_id)) continue;
    seenJobIds.add(a.job_id);
    unique.push(a);
  }

  // Resolve job details from jobs table + quotes table
  const jobIds = unique.map(a => a.job_id).filter(Boolean);
  const jobMap = {};

  if (jobIds.length > 0) {
    // Try jobs table first
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, aircraft_make, aircraft_model, tail_number, airport, customer_name, scheduled_date, services, status')
      .in('id', jobIds);
    for (const j of (jobs || [])) {
      const aircraft = [j.aircraft_make, j.aircraft_model].filter(Boolean).join(' ') || 'Aircraft';
      let serviceList = [];
      try {
        const parsed = typeof j.services === 'string' ? JSON.parse(j.services) : j.services;
        if (Array.isArray(parsed)) serviceList = parsed.map(s => typeof s === 'string' ? s : (s.name || s.description || ''));
      } catch {}
      jobMap[j.id] = { aircraft, tail_number: j.tail_number, airport: j.airport, customer_name: j.customer_name, scheduled_date: j.scheduled_date, services: serviceList, job_status: j.status };
    }

    // Fill in any missing from quotes table
    const missingIds = jobIds.filter(id => !jobMap[id]);
    if (missingIds.length > 0) {
      const { data: quotes } = await supabase
        .from('quotes')
        .select('id, aircraft_model, aircraft_type, tail_number, airport, client_name, scheduled_date, line_items, status')
        .in('id', missingIds);
      for (const q of (quotes || [])) {
        const serviceList = (q.line_items || []).map(li => li.description || li.service).filter(Boolean);
        jobMap[q.id] = { aircraft: q.aircraft_model || q.aircraft_type || 'Aircraft', tail_number: q.tail_number, airport: q.airport, customer_name: q.client_name, scheduled_date: q.scheduled_date, services: serviceList, job_status: q.status };
      }
    }
  }

  // Flatten: merge assignment fields + job details into one object
  const assignments = unique.map(a => {
    const job = jobMap[a.job_id] || {};
    return {
      id: a.id,
      job_id: a.job_id,
      status: a.status,
      created_at: a.created_at,
      notified_at: a.notified_at,
      // Flattened job fields for card display
      aircraft: job.aircraft || 'Aircraft',
      tail_number: job.tail_number || null,
      airport: job.airport || null,
      customer_name: job.customer_name || null,
      scheduled_date: job.scheduled_date || null,
      services: job.services || [],
      job_status: job.job_status || null,
    };
  });

  return Response.json({ assignments });
}

// PATCH — accept or decline an assignment
export async function PATCH(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { assignment_id, action } = body || {};
  if (!assignment_id || !['accept', 'decline'].includes(action)) {
    return Response.json({ error: 'assignment_id and valid action are required' }, { status: 400 });
  }

  // Verify this assignment belongs to the crew member
  const { data: existing, error: fetchErr } = await supabase
    .from('job_assignments')
    .select('id, job_id, team_member_id, detailer_id')
    .eq('id', assignment_id)
    .single();

  if (fetchErr || !existing) {
    return Response.json({ error: 'Assignment not found' }, { status: 404 });
  }

  if (existing.team_member_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const update =
    action === 'accept'
      ? { status: 'accepted', accepted_at: now }
      : { status: 'declined', declined_at: now };

  const { error: updateErr } = await supabase
    .from('job_assignments')
    .update(update)
    .eq('id', assignment_id);

  if (updateErr) {
    console.error('[crew/assignments] update error:', updateErr);
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  // Log activity
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: existing.detailer_id,
      team_member_id: user.id,
      team_member_name: user.name || null,
      job_id: existing.job_id,
      action_type: action === 'accept' ? 'assignment_accepted' : 'assignment_declined',
      action_details: {
        assignment_id,
        job_id: existing.job_id,
      },
    });
  } catch (logErr) {
    console.error('[crew/assignments] activity log error:', logErr);
  }

  return Response.json({ success: true });
}
