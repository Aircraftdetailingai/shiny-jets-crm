import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const payload = await getAuthUser(request);
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
  const isLead = user.is_lead_tech;
  const contactCols = isLead ? ', client_name, client_phone, client_email' : '';

  // Step 1: Get job_assignments for this crew member (pending or accepted) or all for lead tech
  let assignmentQuery = supabase.from('job_assignments').select('job_id, status');
  if (isLead) {
    assignmentQuery = assignmentQuery.eq('detailer_id', user.detailer_id);
  } else {
    assignmentQuery = assignmentQuery.eq('team_member_id', user.id).in('status', ['pending', 'accepted']);
  }
  const { data: assignments } = await assignmentQuery;
  const assignedJobIds = new Set((assignments || []).map(a => a.job_id).filter(Boolean));
  console.log(`[crew/jobs] member=${user.id} is_lead=${isLead} assignments=${assignedJobIds.size}`);

  const jobs = [];
  const seenIds = new Set();

  // Step 2: Fetch quote-based jobs — lead techs see all, regular crew only see assigned
  try {
    let quoteQuery = supabase
      .from('quotes')
      .select(`id, aircraft_model, aircraft_type, tail_number, airport, scheduled_date, status, line_items, notes, created_at${contactCols}`)
      .eq('detailer_id', user.detailer_id)
      .in('status', ['paid', 'accepted', 'scheduled', 'in_progress'])
      .order('scheduled_date', { ascending: true, nullsFirst: false });

    const { data: quotesJobs, error } = await quoteQuery;
    if (error) {
      console.log('[crew/jobs] quotes error:', error.message);
    } else {
      for (const q of quotesJobs || []) {
        // Regular crew: only show if assigned to this quote (or if no assignments exist for any job — backward compat)
        if (!isLead && assignedJobIds.size > 0 && !assignedJobIds.has(q.id)) continue;
        if (seenIds.has(q.id)) continue;
        seenIds.add(q.id);
        jobs.push(q);
      }
    }
  } catch (e) {
    console.log('[crew/jobs] quotes error:', e.message);
  }

  // Step 3: Fetch manual jobs from jobs table — assigned or all as fallback
  {
    try {
      let jobQuery = supabase
        .from('jobs')
        .select('id, customer_name, customer_email, aircraft_make, aircraft_model, tail_number, airport, services, total_price, status, scheduled_date, schedule_override, created_at, completion_notes')
        .in('status', ['scheduled', 'in_progress']);

      if (assignedJobIds.size > 0 && !isLead) {
        jobQuery = jobQuery.in('id', [...assignedJobIds]);
      } else {
        jobQuery = jobQuery.eq('detailer_id', user.detailer_id);
      }

      const { data: manualJobs } = await jobQuery;

      for (const mj of manualJobs || []) {
        if (seenIds.has(mj.id)) continue;
        seenIds.add(mj.id);
        jobs.push({
          id: mj.id,
          aircraft_model: mj.aircraft_model,
          aircraft_type: mj.aircraft_make,
          airport: mj.airport,
          scheduled_date: mj.scheduled_date,
          schedule_override: !!mj.schedule_override,
          status: mj.status,
          line_items: [],
          notes: mj.completion_notes,
          created_at: mj.created_at,
          client_name: mj.customer_name,
          client_email: mj.customer_email,
          tail_number: mj.tail_number,
          _source: 'jobs_table',
          _services_text: mj.services,
        });
      }
    } catch (e) {
      console.log('[crew/jobs] manual jobs error:', e.message);
    }
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

    // Build display aircraft name:
    // - Quote-based: aircraft_model already contains "Gulfstream G4" (full name from quote builder)
    //   aircraft_type = category like "Jet" — NOT the manufacturer
    // - Manual jobs: aircraft_type = aircraft_make (mapped at push time), aircraft_model = model only
    //   So combine: aircraft_type + aircraft_model = "Gulfstream" + "G4"
    let aircraftDisplay;
    if (job._source === 'jobs_table') {
      // Manual job: aircraft_type holds the make, aircraft_model holds the model
      aircraftDisplay = [job.aircraft_type, job.aircraft_model].filter(Boolean).join(' ') || 'Aircraft';
    } else {
      // Quote-based: aircraft_model is already the full name
      aircraftDisplay = job.aircraft_model || 'Aircraft';
    }

    const result = {
      id: job.id,
      aircraft: aircraftDisplay,
      tail_number: job.tail_number || null,
      airport: job.airport,
      scheduled_date: job.scheduled_date,
      schedule_override: !!job.schedule_override,
      status: job.status,
      services: sanitizedLineItems.length > 0 ? sanitizedLineItems : (Array.isArray(servicesText) ? servicesText.map(s => typeof s === 'string' ? { description: s } : { description: s.name || s.description || 'Service' }) : []),
      notes: job.notes,
      created_at: job.created_at,
      _source: job._source || null,
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
