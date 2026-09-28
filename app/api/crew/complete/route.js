import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const payload = await getAuthUser(request);
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

// POST - Mark a job as complete
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'crewApp', { user: user });
  if (planGate) return planGate;

  const { quote_id, notes } = await request.json();
  if (!quote_id) return Response.json({ error: 'quote_id required' }, { status: 400 });

  const supabase = getSupabase();

  // Verify the job belongs to crew member's detailer and is in a completable status
  const { data: quote, error: fetchErr } = await supabase
    .from('quotes')
    .select('id, status, detailer_id')
    .eq('id', quote_id)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (fetchErr || !quote) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  if (!['paid', 'accepted', 'scheduled', 'in_progress'].includes(quote.status)) {
    return Response.json({ error: 'Job cannot be marked complete from current status' }, { status: 400 });
  }

  let updates = {
    status: 'completed',
    completed_at: new Date().toISOString(),
  };
  if (notes) updates.completed_notes = notes;

  // Column-stripping retry
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase
      .from('quotes')
      .update(updates)
      .eq('id', quote_id);

    if (!error) {
      return Response.json({ success: true, status: 'completed' });
    }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      delete updates[colMatch[1]];
      continue;
    }

    console.error('Complete job error:', error);
    return Response.json({ error: 'Failed to mark job complete' }, { status: 500 });
  }

  return Response.json({ error: 'Failed to mark job complete' }, { status: 500 });
}
