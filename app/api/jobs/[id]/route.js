import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

const ALLOWED_FIELDS = [
  'scheduled_date',
  'scheduled_time',
  'airport',
  'completion_notes',
  'services',
  'tail_number',
  'aircraft_make',
  'aircraft_model',
  'customer_name',
  'customer_email',
  'total_price',
  'status',
];

// PATCH — update an existing job
export async function PATCH(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: jobId } = await params;
  if (!jobId) return Response.json({ error: 'Job ID required' }, { status: 400 });

  const detailerId = user.detailer_id || user.id;
  const body = await request.json();

  // Filter to allowed fields only
  const update = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) {
      // Stringify services array if needed (jobs.services is text)
      if (key === 'services' && Array.isArray(body[key])) {
        update[key] = JSON.stringify(body[key]);
      } else {
        update[key] = body[key];
      }
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify ownership
  const { data: existing } = await supabase
    .from('jobs')
    .select('id, detailer_id')
    .eq('id', jobId)
    .single();

  if (!existing) return Response.json({ error: 'Job not found' }, { status: 404 });
  if (existing.detailer_id !== detailerId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Column-stripping retry
  let updated = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('jobs')
      .update(update)
      .eq('id', jobId)
      .select()
      .single();
    if (!error) { updated = data; break; }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch && update[colMatch[1]] !== undefined) {
      console.log(`[jobs/PATCH] stripping missing column: ${colMatch[1]}`);
      delete update[colMatch[1]];
      continue;
    }
    console.error('[jobs/PATCH] update error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return Response.json({ error: 'Failed to update job' }, { status: 500 });
  }

  return Response.json({ success: true, job: updated });
}
