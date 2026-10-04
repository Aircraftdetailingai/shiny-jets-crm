import { getAuthUser } from '@/lib/auth';
import { pollItem } from '@/lib/ask-brett';
import { getServiceSupabase, requireAdmin, hasPollSecret, appUrl } from '@/lib/ask-brett-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Open Ask Brett questions, newest first, for the Chief of Staff to poll.
//   GET /api/admin/ask-brett/open            (Authorization: Bearer <ASK_BRETT_POLL_SECRET>, or an admin session)
//   GET /api/admin/ask-brett/open?since=ISO  (only questions created after that time)
// Compact on purpose: no photos, no chat context. Open admin_url to see and answer.
export async function GET(request) {
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Not configured' }, { status: 503 });
  if (!hasPollSecret(request)) {
    const admin = await requireAdmin(await getAuthUser(request), supabase);
    if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });
  }
  const sinceRaw = new URL(request.url).searchParams.get('since');
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null;

  let q = supabase
    .from('detailing_ai_escalations')
    .select('id, detailer_id, conversation_id, status, reason, summary, question, photo_paths, created_at')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(100);
  if (since) q = q.gt('created_at', since);
  const { data, error } = await q;
  if (error) return Response.json({ error: 'Queue unavailable' }, { status: 500 });

  const ids = [...new Set((data || []).map((r) => r.detailer_id))];
  const accounts = {};
  if (ids.length) {
    const { data: rows } = await supabase.from('detailers').select('id, email, name, company, plan').in('id', ids);
    (rows || []).forEach((r) => { accounts[r.id] = r; });
  }
  const { count } = await supabase.from('detailing_ai_escalations').select('id', { count: 'exact', head: true }).eq('status', 'open');
  const base = appUrl();
  return Response.json({
    open_count: count ?? (data || []).length,
    oldest_open_at: (data || []).length ? data[data.length - 1].created_at : null,
    generated_at: new Date().toISOString(),
    items: (data || []).map((e) => pollItem(e, accounts[e.detailer_id], base)),
  });
}
