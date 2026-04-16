import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;

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

  // Try jobs table — check rowcount via select
  const { data: jobRow } = await supabase.from('jobs').select('id').eq('id', id).eq('detailer_id', detailerId).maybeSingle();
  if (jobRow) {
    // Column-stripping retry for new fields
    let payload = { ...updates };
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('jobs').update(payload).eq('id', id).eq('detailer_id', detailerId);
      if (!error) return Response.json({ success: true, ...updates });
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) { delete payload[colMatch[1]]; continue; }
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
      if (!error) return Response.json({ success: true, ...updates });
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) { delete payload[colMatch[1]]; continue; }
      console.error('[jobs/progress] quotes update error:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'Job not found' }, { status: 404 });
}
