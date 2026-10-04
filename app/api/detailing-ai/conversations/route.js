import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { getServiceSupabase, accountIdFor } from '@/lib/ask-brett-server';
import { listConversations } from '@/lib/detailing-ai-conversations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// GET: this user's saved Detailing AI chats (newest first), plus how many have an
// expert answer or are waiting on one.
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'crew') return Response.json({ error: 'Owner/staff access required' }, { status: 403 });
  const planGate = await requireFeature(request, 'detailingAi', { user });
  if (planGate) return planGate;
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ conversations: [], unavailable: true });
  const accountId = accountIdFor(user);
  const { data, error } = await listConversations(supabase, { accountId, userId: user.id });
  if (error) return Response.json({ conversations: [], unavailable: true });

  const ids = data.map((c) => c.id);
  const byConv = {};
  if (ids.length) {
    const { data: esc } = await supabase
      .from('detailing_ai_escalations')
      .select('conversation_id, status')
      .eq('detailer_id', accountId)
      .in('conversation_id', ids);
    for (const e of esc || []) {
      const b = (byConv[e.conversation_id] ||= { open: 0, answered: 0 });
      b[e.status === 'answered' ? 'answered' : 'open'] += 1;
    }
  }
  return Response.json({
    conversations: data.map((c) => ({ ...c, title: c.title || 'New chat', expert: byConv[c.id] || { open: 0, answered: 0 } })),
  });
}
