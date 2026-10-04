import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { getServiceSupabase, accountIdFor } from '@/lib/ask-brett-server';
import { getOwnedConversation, createConversation, isUuid, cleanTitle } from '@/lib/detailing-ai-conversations';
import { summarizeMessages } from '@/lib/detailing-ai-summary';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// POST: "Start a fresh chat (summary carried over)". Summarizes the whole chat (rolling summary +
// anything newer), then creates a new chat in the same project that carries that summary.
export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'crew') return Response.json({ error: 'Owner/staff access required' }, { status: 403 });
  const planGate = await requireFeature(request, 'detailingAi', { user });
  if (planGate) return planGate;
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Not configured' }, { status: 503 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: 'Chat not found' }, { status: 404 });
  const accountId = accountIdFor(user);
  const conv = await getOwnedConversation(supabase, { id, accountId, userId: user.id });
  if (!conv) return Response.json({ error: 'Chat not found' }, { status: 404 });

  const since = conv.summary_through_at ? String(conv.summary_through_at) : '';
  const newer = (conv.messages || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && (!since || String(m.created_at || '') > since));
  const previous = [conv.carried_summary, conv.summary].filter(Boolean).join('\n');
  const { summary } = await summarizeMessages({ previousSummary: previous, messages: newer });
  const baseTitle = (conv.title || 'Chat').replace(/\s*\(continued\)$/i, '');
  const { data, error } = await createConversation(supabase, {
    accountId,
    userId: user.id,
    title: cleanTitle(`${baseTitle.slice(0, 66)} (continued)`),
    projectId: conv.project_id || null,
    carriedSummary: summary || null,
    carriedFrom: conv.id,
  });
  if (error || !data) return Response.json({ error: 'Could not start a fresh chat right now.' }, { status: 503 });
  return Response.json({ conversation: { ...data, carried_summary: data.carried_summary ?? summary, carried_from: data.carried_from ?? conv.id, project_id: data.project_id ?? conv.project_id ?? null } });
}
