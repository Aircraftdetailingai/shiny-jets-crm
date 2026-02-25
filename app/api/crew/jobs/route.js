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

  const { data: jobs, error } = await query;

  if (error) {
    console.error('Crew jobs fetch error:', error);
    return Response.json({ error: 'Failed to fetch jobs' }, { status: 500 });
  }

  // Strip pricing from line items - crew should never see pricing
  const sanitizedJobs = (jobs || []).map(job => {
    const sanitizedLineItems = (job.line_items || []).map(li => ({
      description: li.description,
      hours: li.hours,
      service_type: li.service_type,
    }));

    const result = {
      id: job.id,
      aircraft: job.aircraft_model || job.aircraft_type || 'Aircraft',
      airport: job.airport,
      scheduled_date: job.scheduled_date,
      status: job.status,
      services: sanitizedLineItems,
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

  return Response.json({ jobs: sanitizedJobs });
}
