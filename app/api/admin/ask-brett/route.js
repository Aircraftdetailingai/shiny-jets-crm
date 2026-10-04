import { getAuthUser } from '@/lib/auth';
import { getServiceSupabase, requireAdmin, signedPhotoUrls } from '@/lib/ask-brett-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Admin-only Ask Brett queue. ?status=open (default) | answered
export async function GET(request) {
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Not configured' }, { status: 503 });
  const user = await getAuthUser(request);
  const admin = await requireAdmin(user, supabase);
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const status = new URL(request.url).searchParams.get('status') === 'answered' ? 'answered' : 'open';
  const { data, error } = await supabase
    .from('detailing_ai_escalations')
    .select('id, detailer_id, conversation_id, user_email, status, reason, summary, question, context, ai_reply, photo_paths, photos_expire_at, answer, answered_by, answered_at, added_to_knowledge, created_at')
    .eq('status', status)
    .order('created_at', { ascending: status === 'open' })
    .limit(50);
  if (error) return Response.json({ error: 'Queue unavailable (has the Ask Brett migration run?)', items: [] }, { status: 500 });

  const ids = [...new Set((data || []).map((r) => r.detailer_id))];
  const accounts = {};
  if (ids.length) {
    const { data: rows } = await supabase.from('detailers').select('id, email, name, company, plan').in('id', ids);
    (rows || []).forEach((r) => { accounts[r.id] = r; });
  }
  // The chat each question came from (read-only, admins only) so Brett can see the whole thread.
  const convIds = [...new Set((data || []).map((r) => r.conversation_id).filter(Boolean))];
  const convs = {};
  if (convIds.length) {
    const { data: rows } = await supabase.from('detailing_ai_conversations').select('id, title, messages').in('id', convIds);
    (rows || []).forEach((r) => {
      convs[r.id] = { id: r.id, title: r.title || 'Chat', messages: (r.messages || []).slice(-30).map((m) => ({ role: m.role, text: String(m.display ?? m.content ?? '').slice(0, 1500), photo_count: m.photo_count || 0, created_at: m.created_at })) };
    });
  }
  const { count: openCount } = await supabase
    .from('detailing_ai_escalations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  const items = await Promise.all((data || []).map(async (r) => ({
    ...r,
    photo_paths: undefined,
    photo_urls: await signedPhotoUrls(supabase, r.photo_paths),
    account: accounts[r.detailer_id] || null,
    conversation: r.conversation_id ? convs[r.conversation_id] || null : null,
  })));
  return Response.json({ items, status, open_count: openCount ?? null });
}
