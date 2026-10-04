import crypto from 'crypto';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { validatePhotos, MAX_PHOTOS } from '@/lib/detailing-ai-photos';
import {
  verifyEscalationTicket,
  escalationAllowance,
  limitReachedText,
  shapeContext,
  questionFromContext,
  photoExpiry,
} from '@/lib/ask-brett';
import {
  getServiceSupabase,
  accountIdFor,
  storeEscalationPhotos,
  signedPhotoUrls,
  notifyBrett,
  expireUnpaid,
  resumeCheckoutUrl,
} from '@/lib/ask-brett-server';
import { getOwnedConversation } from '@/lib/detailing-ai-conversations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const PUBLIC_FIELDS = 'id, conversation_id, status, reason, summary, question, photo_paths, answer, answered_at, created_at';
const PUBLIC_FIELDS_V2 = `${PUBLIC_FIELDS}, payment_expires_at, paid_at`;

async function gate(request) {
  const user = await getAuthUser(request);
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'crew') return { error: Response.json({ error: 'Owner/staff access required' }, { status: 403 }) };
  const planGate = await requireFeature(request, 'detailingAi', { user });
  if (planGate) return { error: planGate };
  const supabase = getServiceSupabase();
  if (!supabase) return { error: Response.json({ error: 'Not configured' }, { status: 503 }) };
  return { user, supabase, accountId: accountIdFor(user) };
}

// POST: file an escalation the AI asked for (signed ticket from /api/detailing-ai/chat).
// These are FREE (the AI couldn't answer). The paid button uses /api/detailing-ai/ask-expert.
// Body: { ticket, messages: [{role, content}], ai_reply, photos: [{media_type, data}] (<= 3) }
export async function POST(request) {
  try {
    const g = await gate(request);
    if (g.error) return g.error;
    const { user, supabase, accountId } = g;
    const body = await request.json().catch(() => ({}));

    const t = verifyEscalationTicket(body.ticket, { detailerId: accountId });
    if (!t.ok) return Response.json({ error: 'This expert request expired. Ask your question again.', code: 'BAD_TICKET' }, { status: 400 });
    // "I want a person" is the paid button ($4.99 for one question), never a free ticket.
    if (t.reason === 'user_asked') return Response.json({ error: 'Use the Ask a Shiny Jets expert button for this ($4.99 for one question).', code: 'PAID_QUESTION' }, { status: 402 });

    const photoCheck = validatePhotos(body.photos);
    if (!photoCheck.ok) return Response.json({ error: photoCheck.error, code: 'PHOTO_INVALID', max_photos: MAX_PHOTOS }, { status: photoCheck.status });

    const allowance = await escalationAllowance(supabase, accountId);
    if (!allowance.ok) {
      if (allowance.which === 'unavailable') return Response.json({ error: 'Expert questions are unavailable right now.' }, { status: 503 });
      return Response.json({ error: limitReachedText(allowance.which), code: 'RATE_LIMITED', rateLimited: true }, { status: 429 });
    }

    // One ticket files one escalation: the same ticket (double tap, retry) returns the existing row.
    const ticketHash = crypto.createHash('sha256').update(String(body.ticket)).digest('hex');
    const { data: existing } = await supabase
      .from('detailing_ai_escalations')
      .select(PUBLIC_FIELDS)
      .eq('detailer_id', accountId)
      .eq('ticket_hash', ticketHash)
      .maybeSingle();
    if (existing) return Response.json({ escalation: { ...existing, photo_paths: undefined, photo_count: existing.photo_paths?.length || 0 } });

    // Link back to the chat it came from (only if that chat is this user's).
    const conv = t.conversationId
      ? await getOwnedConversation(supabase, { id: t.conversationId, accountId, userId: user.id }, 'id')
      : null;

    const context = shapeContext(body.messages);
    const id = crypto.randomUUID();
    const images = photoCheck.images;
    const { paths } = await storeEscalationPhotos(supabase, { detailerId: accountId, escalationId: id, images });

    const { data: account } = await supabase.from('detailers').select('id, email, name, company').eq('id', accountId).maybeSingle();
    const row = {
      id,
      detailer_id: accountId,
      conversation_id: conv?.id || null,
      user_id: String(user.id),
      user_email: user.email || account?.email || null,
      reason: t.reason,
      summary: t.summary || null,
      question: questionFromContext(context, t.summary),
      context,
      ai_reply: typeof body.ai_reply === 'string' ? body.ai_reply.slice(0, 4000) : null,
      photo_paths: paths,
      photos_expire_at: paths.length ? photoExpiry() : null,
      ticket_hash: ticketHash,
      status: 'open',
    };
    const { data: saved, error } = await supabase.from('detailing_ai_escalations').insert(row).select(PUBLIC_FIELDS).single();
    if (error) {
      console.error('[ask-brett] insert failed:', error.message);
      return Response.json({ error: "Couldn't send this to an expert right now. Try again in a minute." }, { status: 500 });
    }

    const notified = await notifyBrett(supabase, { escalation: { ...row, ...saved }, account: account || { email: user.email }, images });
    if (!notified.emailed) console.error('[ask-brett] Brett email not sent for', id);

    return Response.json({ escalation: { ...saved, photo_paths: undefined, photo_count: paths.length } }, { status: 201 });
  } catch (err) {
    console.error('[ask-brett] POST error:', err);
    return Response.json({ error: "Couldn't send this to an expert right now." }, { status: 500 });
  }
}

// GET: this account's expert questions (last 30 days), newest last, with short-lived photo links.
export async function GET(request) {
  try {
    const g = await gate(request);
    if (g.error) return g.error;
    const { supabase, accountId } = g;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await expireUnpaid(supabase, { detailerId: accountId }).catch(() => {});
    const run = (fields) => supabase
      .from('detailing_ai_escalations')
      .select(fields)
      .eq('detailer_id', accountId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(20);
    let { data, error } = await run(PUBLIC_FIELDS_V2);
    if (error && /column|schema cache|42703|PGRST204/i.test(`${error.code || ''} ${error.message || ''}`)) ({ data, error } = await run(PUBLIC_FIELDS));
    if (error) return Response.json({ escalations: [], unavailable: true });
    const { user } = g;
    const escalations = await Promise.all((data || []).map(async (e) => ({
      ...e,
      photo_paths: undefined,
      photo_urls: await signedPhotoUrls(supabase, e.photo_paths),
      checkout_url: resumeCheckoutUrl(e, user),
    })));
    return Response.json({ escalations });
  } catch (err) {
    console.error('[ask-brett] GET error:', err);
    return Response.json({ escalations: [], unavailable: true });
  }
}
