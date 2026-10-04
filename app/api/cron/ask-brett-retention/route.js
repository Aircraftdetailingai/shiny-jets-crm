import { ESCALATION_BUCKET } from '@/lib/ask-brett';
import { getServiceSupabase, expireUnpaid } from '@/lib/ask-brett-server';

export const dynamic = 'force-dynamic';

// Daily: escalation photos are kept 90 days (photos_expire_at), then deleted from storage.
// The question/answer text stays so the user's thread and Brett's history still make sense.
// Also: unpaid "Ask a Shiny Jets expert" questions expire after 24 h (status 'expired', photos
// removed). The user-facing routes run the same sweep per account, so expiry is on time even
// though this cron runs daily.
function verifySecret(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;
}

async function run(request) {
  if (!verifySecret(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Not configured' }, { status: 503 });
  const unpaid = await expireUnpaid(supabase, { limit: 500 });
  const { data, error } = await supabase
    .from('detailing_ai_escalations')
    .select('id, photo_paths')
    .lt('photos_expire_at', new Date().toISOString())
    .is('photos_deleted_at', null)
    .limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let removed = 0;
  let rows = 0;
  for (const r of data || []) {
    const paths = r.photo_paths || [];
    if (paths.length) {
      const { error: delErr } = await supabase.storage.from(ESCALATION_BUCKET).remove(paths);
      if (delErr) { console.error('[ask-brett-retention] remove failed', r.id, delErr.message); continue; }
      removed += paths.length;
    }
    await supabase.from('detailing_ai_escalations').update({ photo_paths: [], photos_deleted_at: new Date().toISOString() }).eq('id', r.id);
    rows += 1;
  }
  return Response.json({ ok: true, rows, photos_removed: removed, unpaid_expired: unpaid.expired || 0 });
}

export const GET = run;
export const POST = run;
