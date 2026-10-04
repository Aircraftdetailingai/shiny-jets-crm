import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { getServiceSupabase, accountIdFor, signedPhotoUrls, expireUnpaid, resumeCheckoutUrl } from '@/lib/ask-brett-server';
import { getOwnedConversation, getOwnedProject, cleanTitle, isUuid } from '@/lib/detailing-ai-conversations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function ctx(request, params) {
  const user = await getAuthUser(request);
  if (!user) return { res: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'crew') return { res: Response.json({ error: 'Owner/staff access required' }, { status: 403 }) };
  const planGate = await requireFeature(request, 'detailingAi', { user });
  if (planGate) return { res: planGate };
  const supabase = getServiceSupabase();
  if (!supabase) return { res: Response.json({ error: 'Not configured' }, { status: 503 }) };
  const { id } = await params;
  if (!isUuid(id)) return { res: Response.json({ error: 'Chat not found' }, { status: 404 }) };
  return { user, supabase, id, accountId: accountIdFor(user) };
}

// GET: one chat (must belong to this user + account) with its expert questions/answers.
export async function GET(request, { params }) {
  const c = await ctx(request, params);
  if (c.res) return c.res;
  const conv = await getOwnedConversation(c.supabase, { id: c.id, accountId: c.accountId, userId: c.user.id });
  if (!conv) return Response.json({ error: 'Chat not found' }, { status: 404 });
  await expireUnpaid(c.supabase, { detailerId: c.accountId }).catch(() => {});
  const base = 'id, status, reason, summary, question, photo_paths, answer, answered_at, created_at';
  const run = (fields) => c.supabase
    .from('detailing_ai_escalations')
    .select(fields)
    .eq('detailer_id', c.accountId)
    .eq('conversation_id', c.id)
    .order('created_at', { ascending: true });
  let { data: esc, error: escErr } = await run(`${base}, payment_expires_at, paid_at`);
  if (escErr) ({ data: esc } = await run(base));
  const escalations = await Promise.all((esc || []).map(async (e) => ({
    ...e,
    photo_paths: undefined,
    photo_urls: await signedPhotoUrls(c.supabase, e.photo_paths),
    checkout_url: resumeCheckoutUrl(e, c.user),
  })));
  return Response.json({ conversation: { ...conv, title: conv.title || 'New chat' }, escalations });
}

// PATCH: rename and/or move to a project. Body { title?, project_id? } (project_id null = Unsorted)
export async function PATCH(request, { params }) {
  const c = await ctx(request, params);
  if (c.res) return c.res;
  const body = await request.json().catch(() => ({}));
  const patch = {};
  if (body.title !== undefined) {
    const title = cleanTitle(body.title);
    if (!title) return Response.json({ error: 'Give the chat a name.' }, { status: 400 });
    patch.title = title;
  }
  if (body.project_id !== undefined) {
    if (body.project_id === null || body.project_id === '') patch.project_id = null;
    else {
      const project = await getOwnedProject(c.supabase, { id: body.project_id, accountId: c.accountId, userId: c.user.id });
      if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
      patch.project_id = project.id;
    }
  }
  if (!Object.keys(patch).length) return Response.json({ error: 'Nothing to change.' }, { status: 400 });
  const { data, error } = await c.supabase
    .from('detailing_ai_conversations')
    .update(patch)
    .eq('id', c.id)
    .eq('detailer_id', c.accountId)
    .eq('user_id', String(c.user.id))
    .select(patch.project_id !== undefined ? 'id, title, project_id, updated_at' : 'id, title, updated_at')
    .maybeSingle();
  if (error && patch.project_id !== undefined) return Response.json({ error: 'Projects aren\u2019t available right now.' }, { status: 503 });
  if (error || !data) return Response.json({ error: 'Chat not found' }, { status: 404 });
  return Response.json({ conversation: data });
}

// DELETE: removes the chat. Expert questions stay in Brett's queue (conversation_id is set null),
// and their answers are still emailed.
export async function DELETE(request, { params }) {
  const c = await ctx(request, params);
  if (c.res) return c.res;
  const { data, error } = await c.supabase
    .from('detailing_ai_conversations')
    .delete()
    .eq('id', c.id)
    .eq('detailer_id', c.accountId)
    .eq('user_id', String(c.user.id))
    .select('id');
  if (error || !data?.length) return Response.json({ error: 'Chat not found' }, { status: 404 });
  return Response.json({ ok: true });
}
