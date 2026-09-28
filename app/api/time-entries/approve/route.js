import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'timeClock', { user: user });
  if (planGate) return planGate;

  const { entry_ids, action } = await request.json();

  if (!entry_ids?.length || !['approve', 'reject'].includes(action)) {
    return Response.json({ error: 'entry_ids and action (approve/reject) required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify all entries belong to the detailer's team
  const { data: entries } = await supabase
    .from('time_entries')
    .select('id, detailer_id')
    .in('id', entry_ids);

  const valid = (entries || []).filter(e => e.detailer_id === user.id);
  if (valid.length === 0) {
    return Response.json({ error: 'No valid entries found' }, { status: 404 });
  }

  const validIds = valid.map(e => e.id);

  if (action === 'approve') {
    let updates = {
      approved: true,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    };

    // Column-stripping retry
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase
        .from('time_entries')
        .update(updates)
        .in('id', validIds);

      if (!error) {
        return Response.json({ success: true, approved: validIds.length });
      }

      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
      if (colMatch) {
        delete updates[colMatch[1]];
        continue;
      }

      console.error('Approve error:', error);
      return Response.json({ error: 'Failed to approve' }, { status: 500 });
    }
  }

  if (action === 'reject') {
    // Delete the entries (rejected = removed)
    const { error } = await supabase
      .from('time_entries')
      .delete()
      .in('id', validIds);

    if (error) {
      console.error('Reject error:', error);
      return Response.json({ error: 'Failed to reject' }, { status: 500 });
    }

    return Response.json({ success: true, rejected: validIds.length });
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 });
}
