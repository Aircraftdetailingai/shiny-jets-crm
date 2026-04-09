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

// GET - Fetch active jobs for crew member's detailer
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days')) || 7;

  const supabase = getSupabase();

  // Fetch active jobs (paid, scheduled, accepted, in_progress) for next X days
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + days);

  // Get quotes that are active jobs
  let query = supabase
    .from('quotes')
    .select('id, aircraft_model, aircraft_type, airport, scheduled_date, status, line_items, notes, created_at')
    .eq('detailer_id', user.detailer_id)
    .in('status', ['paid', 'accepted', 'scheduled', 'in_progress'])
    .order('scheduled_date', { ascending: true, nullsFirst: false });

  // Only include lead tech fields if authorized
  if (user.is_lead_tech) {
    query = supabase
      .from('quotes')
      .select('id, aircraft_model, aircraft_type, airport, scheduled_date, status, line_items, notes, created_at, client_name, client_phone, client_email')
      .eq('detailer_id', user.detailer_id)
      .in('status', ['paid', 'accepted', 'scheduled', 'in_progress'])
      .order('scheduled_date', { ascending: true, nullsFirst: false });
  }

  const { data: quotesJobs, error } = await query;

  console.log('[crew/jobs] member:', user.id, 'detailer:', user.detailer_id, 'quote_jobs:', quotesJobs?.length || 0, 'error:', error?.message || 'none');

  if (error) {
    console.error('Crew jobs fetch error:', error);
    return Response.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }

  const jobs = [...(quotesJobs || [])];

  // Also fetch manually created jobs — assigned to this crew member, or ALL if lead tech
  try {
    let assignmentQuery = supabase.from('job_assignments').select('job_id');
    if (user.is_lead_tech) {
      assignmentQuery = assignmentQuery.eq('detailer_id', user.detailer_id);
    } else {
      assignmentQuery = assignmentQuery.eq('team_member_id', user.id);
    }
    const { data: assignments, error: assignErr } = await assignmentQuery;
    console.log(`[crew-jobs] user.id=${user.id} is_lead=${user.is_lead_tech} assignments=${assignments?.length || 0} err=${assignErr?.message || 'none'}`);

    if (assignments?.length > 0) {
      const assignedJobIds = assignments.map(a => a.job_id).filter(Boolean);
      const { data: manualJobs } = await supabase
        .from('jobs')
        .select('id, customer_name, customer_email, aircraft_make, aircraft_model, tail_number, airport, services, total_price, status, scheduled_date, created_at, completion_notes')
        .in('id', assignedJobIds)
        .in('status', ['scheduled', 'in_progress']);

      if (manualJobs?.length > 0) {
        for (const mj of manualJobs) {
          // Convert to same format as quote-based jobs
          jobs.push({
            id: mj.id,
            aircraft_model: mj.aircraft_model,
            aircraft_type: mj.aircraft_make,
            airport: mj.airport,
            scheduled_date: mj.scheduled_date,
            status: mj.status,
            line_items: [],
            notes: mj.completion_notes,
            created_at: mj.created_at,
            client_name: mj.customer_name,
            client_email: mj.customer_email,
            _source: 'jobs_table',
            _services_text: mj.services,
          });
        }
      }
    }
  } catch (e) {
    console.log('[crew-jobs] Assignments query error:', e.message);
  }

  // Strip pricing from line items - crew should never see pricing
  const sanitizedJobs = (jobs || []).map(job => {
    const sanitizedLineItems = (job.line_items || []).map(li => ({
      description: li.description,
      hours: li.hours,
      service_type: li.service_type,
    }));

    // Parse services text from manual jobs
    let servicesText = null;
    if (job._services_text) {
      try { servicesText = JSON.parse(job._services_text); } catch { servicesText = job._services_text; }
    }

    const result = {
      id: job.id,
      aircraft: job.aircraft_model || job.aircraft_type || 'Aircraft',
      airport: job.airport,
      scheduled_date: job.scheduled_date,
      status: job.status,
      services: sanitizedLineItems.length > 0 ? sanitizedLineItems : (Array.isArray(servicesText) ? servicesText.map(s => ({ description: s })) : []),
      notes: job.notes,
      created_at: job.created_at,
    };

    // Only include contact info for lead techs
    if (user.is_lead_tech) {
      result.client_name = job.client_name;
      result.client_phone = job.client_phone;
      result.client_email = job.client_email;
    }

    return result;
  });

  console.log('[crew/jobs] member:', user.id, 'total results:', sanitizedJobs.length);
  return Response.json({ jobs: sanitizedJobs });
}
