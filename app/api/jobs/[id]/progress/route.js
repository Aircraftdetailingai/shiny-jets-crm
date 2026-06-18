import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { supersedePendingAssignments } from '@/lib/supersede-assignments';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();
  // Resolve the owning detailer_id. Owner JWTs put the detailer's id in
  // user.id directly. Crew JWTs put the team_member id in user.id and the
  // detailer's id in user.detailer_id — but older crew sessions / any
  // future auth path that doesn't persist detailer_id would fall through
  // to user.id (a team_member uuid), which then fails the
  // .eq('detailer_id', ...) gate below and 404s the save with no log
  // entry the user can see. Derive from team_members as a fallback so the
  // crew save survives a stale JWT.
  let detailerId = user.detailer_id || null;
  if (!detailerId && user.role === 'crew' && user.id) {
    const { data: tm } = await supabase
      .from('team_members')
      .select('detailer_id')
      .eq('id', user.id)
      .maybeSingle();
    detailerId = tm?.detailer_id || null;
  }
  if (!detailerId) detailerId = user.id; // owner-shaped JWT: id IS the detailer
  console.log('[jobs/progress] resolved detailerId:', detailerId, 'role:', user.role || 'owner', 'user.id:', user.id);

  const updates = {};
  if (body.progress_percentage !== undefined) {
    updates.progress_percentage = Math.min(100, Math.max(0, parseInt(body.progress_percentage) || 0));
  }
  if (body.share_progress_with_customer !== undefined) {
    updates.share_progress_with_customer = !!body.share_progress_with_customer;
  }
  if (body.status !== undefined) {
    updates.status = body.status;
  }
  if (body.completed_at !== undefined) {
    updates.completed_at = body.completed_at;
  }

  if (Object.keys(updates).length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });

  console.log('[jobs/progress] id:', id, 'detailer:', detailerId, 'updates:', updates);

  // jobs.status CHECK constraint accepts ['scheduled','in_progress','complete','cancelled']
  // (no trailing 'd' on complete). The crew "Mark Complete" path sends 'completed' which
  // matches what the quotes table expects but violates this constraint and 500s the save.
  // Normalize per-table so both code paths keep working.
  const jobsUpdates = { ...updates };
  if (jobsUpdates.status === 'completed') jobsUpdates.status = 'complete';

  // Try jobs table — check rowcount via select
  const { data: jobRow } = await supabase.from('jobs').select('id').eq('id', id).eq('detailer_id', detailerId).maybeSingle();
  if (jobRow) {
    // Column-stripping retry for new fields
    let payload = { ...jobsUpdates };
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('jobs').update(payload).eq('id', id).eq('detailer_id', detailerId);
      if (!error) {
        // Job just completed → close out any still-pending assignments.
        if (jobsUpdates.status === 'complete') {
          try { await supersedePendingAssignments(supabase, id); } catch (e) { console.error('[jobs/progress] supersede error:', e?.message || e); }
        }
        return Response.json({ success: true, ...jobsUpdates }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
      }
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) { delete payload[colMatch[1]]; continue; }
      // CHECK constraint violation surfaces as code 23514. Drop the offending field
      // (status is the only constrained one we touch) and retry rather than 500.
      if (error.code === '23514' || /violates check constraint/i.test(error.message || '')) {
        console.error('[jobs/progress] jobs CHECK violation, dropping status:', error.message, 'payload:', payload);
        if ('status' in payload) { delete payload.status; continue; }
      }
      console.error('[jobs/progress] jobs update error:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  // Fall through to quotes table (legacy)
  const { data: quoteRow } = await supabase.from('quotes').select('id').eq('id', id).eq('detailer_id', detailerId).maybeSingle();
  if (quoteRow) {
    let payload = { ...updates };
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('quotes').update(payload).eq('id', id).eq('detailer_id', detailerId);
      if (!error) return Response.json({ success: true, ...updates }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) { delete payload[colMatch[1]]; continue; }
      console.error('[jobs/progress] quotes update error:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'Job not found' }, { status: 404 });
}
