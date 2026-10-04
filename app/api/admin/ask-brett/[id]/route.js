import { getAuthUser } from '@/lib/auth';
import { MAX_ANSWER_CHARS } from '@/lib/ask-brett';
import {
  getServiceSupabase,
  requireAdmin,
  notifyUserAnswered,
  addAnswerToKnowledge,
} from '@/lib/ask-brett-server';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Admin answers an escalation: saves the answer (shows in the user's chat thread), emails the
// user, and (add_to_knowledge, default true) saves the Q&A to the shared knowledge as Brett-approved.
export async function POST(request, { params }) {
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Not configured' }, { status: 503 });
  const user = await getAuthUser(request);
  const admin = await requireAdmin(user, supabase);
  if (!admin.ok) return Response.json({ error: admin.error }, { status: admin.status });

  const { id } = await params;
  if (!UUID.test(String(id || ''))) return Response.json({ error: 'Not found' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  if (!answer) return Response.json({ error: 'Type an answer first.' }, { status: 400 });
  if (answer.length > MAX_ANSWER_CHARS) return Response.json({ error: `Keep the answer under ${MAX_ANSWER_CHARS} characters.` }, { status: 400 });
  const addToKnowledge = body.add_to_knowledge !== false;

  const { data: current, error: loadErr } = await supabase
    .from('detailing_ai_escalations')
    .select('id, detailer_id, user_email, status, summary, question')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !current) return Response.json({ error: 'Not found' }, { status: 404 });
  if (current.status === 'answered') return Response.json({ error: 'Already answered.' }, { status: 409 });

  const answeredAt = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('detailing_ai_escalations')
    .update({ status: 'answered', answer, answered_by: user.email || String(user.id), answered_at: answeredAt })
    .eq('id', id)
    .eq('status', 'open')
    .select('id, detailer_id, conversation_id, user_email, status, summary, question, answer, answered_at')
    .maybeSingle();
  if (error || !updated) return Response.json({ error: 'Already answered.' }, { status: 409 });

  let knowledge = { ok: false, skipped: !addToKnowledge };
  if (addToKnowledge) {
    knowledge = await addAnswerToKnowledge(supabase, updated);
    if (knowledge.ok) {
      await supabase.from('detailing_ai_escalations').update({ added_to_knowledge: true, knowledge_slug: knowledge.slug }).eq('id', id);
    } else {
      console.error('[ask-brett] knowledge save failed:', knowledge.error);
    }
  }
  const notified = await notifyUserAnswered(supabase, { escalation: updated });

  return Response.json({
    ok: true,
    escalation: { ...updated, added_to_knowledge: !!knowledge.ok },
    emailed: notified.emailed,
    knowledge: knowledge.ok ? 'saved' : addToKnowledge ? 'failed' : 'skipped',
  });
}
