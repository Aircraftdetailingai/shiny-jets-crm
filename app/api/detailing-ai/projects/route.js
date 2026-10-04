import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { getServiceSupabase, accountIdFor } from '@/lib/ask-brett-server';
import { listProjects, PROJECT_FIELDS, PROJECT_LIMIT } from '@/lib/detailing-ai-conversations';
import { cleanProjectName, cleanNotes } from '@/lib/detailing-ai-context';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function ctx(request) {
  const user = await getAuthUser(request);
  if (!user) return { res: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'crew') return { res: Response.json({ error: 'Owner/staff access required' }, { status: 403 }) };
  const planGate = await requireFeature(request, 'detailingAi', { user });
  if (planGate) return { res: planGate };
  return { user, supabase: getServiceSupabase(), accountId: accountIdFor(user) };
}

// GET: this user's projects (A-Z). Chats with no project are "Unsorted" on the page.
export async function GET(request) {
  const c = await ctx(request);
  if (c.res) return c.res;
  if (!c.supabase) return Response.json({ projects: [], unavailable: true });
  const { data, error } = await listProjects(c.supabase, { accountId: c.accountId, userId: c.user.id });
  if (error) return Response.json({ projects: [], unavailable: true });
  return Response.json({ projects: data });
}

// POST { name, notes? }: create a project.
export async function POST(request) {
  const c = await ctx(request);
  if (c.res) return c.res;
  if (!c.supabase) return Response.json({ error: 'Projects aren\u2019t available right now.' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const name = cleanProjectName(body.name);
  if (!name) return Response.json({ error: 'Give the project a name.' }, { status: 400 });
  const { data: existing } = await listProjects(c.supabase, { accountId: c.accountId, userId: c.user.id });
  if (existing.length >= PROJECT_LIMIT) return Response.json({ error: `You can have up to ${PROJECT_LIMIT} projects.` }, { status: 400 });
  const { data, error } = await c.supabase
    .from('detailing_ai_projects')
    .insert({ detailer_id: c.accountId, user_id: String(c.user.id), name, notes: cleanNotes(body.notes) || null })
    .select(PROJECT_FIELDS)
    .single();
  if (error || !data) return Response.json({ error: 'Projects aren\u2019t available right now.' }, { status: 503 });
  return Response.json({ project: data });
}
