import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { getServiceSupabase, accountIdFor } from '@/lib/ask-brett-server';
import { getOwnedProject, PROJECT_FIELDS, isUuid } from '@/lib/detailing-ai-conversations';
import { cleanProjectName, cleanNotes } from '@/lib/detailing-ai-context';

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
  if (!isUuid(id)) return { res: Response.json({ error: 'Project not found' }, { status: 404 }) };
  const accountId = accountIdFor(user);
  const project = await getOwnedProject(supabase, { id, accountId, userId: user.id });
  if (!project) return { res: Response.json({ error: 'Project not found' }, { status: 404 }) };
  return { user, supabase, id, accountId, project };
}

// PATCH { name?, notes? }
export async function PATCH(request, { params }) {
  const c = await ctx(request, params);
  if (c.res) return c.res;
  const body = await request.json().catch(() => ({}));
  const patch = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = cleanProjectName(body.name);
    if (!name) return Response.json({ error: 'Give the project a name.' }, { status: 400 });
    patch.name = name;
  }
  if (body.notes !== undefined) patch.notes = cleanNotes(body.notes) || null;
  const { data, error } = await c.supabase
    .from('detailing_ai_projects')
    .update(patch)
    .eq('id', c.id)
    .eq('detailer_id', c.accountId)
    .eq('user_id', String(c.user.id))
    .select(PROJECT_FIELDS)
    .maybeSingle();
  if (error || !data) return Response.json({ error: 'Project not found' }, { status: 404 });
  return Response.json({ project: data });
}

// DELETE: removes the project; its chats move to Unsorted (they are not deleted).
export async function DELETE(request, { params }) {
  const c = await ctx(request, params);
  if (c.res) return c.res;
  await c.supabase
    .from('detailing_ai_conversations')
    .update({ project_id: null })
    .eq('project_id', c.id)
    .eq('detailer_id', c.accountId)
    .eq('user_id', String(c.user.id));
  const { data, error } = await c.supabase
    .from('detailing_ai_projects')
    .delete()
    .eq('id', c.id)
    .eq('detailer_id', c.accountId)
    .eq('user_id', String(c.user.id))
    .select('id');
  if (error || !data?.length) return Response.json({ error: 'Project not found' }, { status: 404 });
  return Response.json({ ok: true });
}
