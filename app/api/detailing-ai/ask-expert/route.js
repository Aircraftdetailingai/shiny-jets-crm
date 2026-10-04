import crypto from 'crypto';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { validatePhotos, MAX_PHOTOS } from '@/lib/detailing-ai-photos';
import { escalationAllowance, limitReachedText, shapeContext, questionFromContext, askExpertSummary, photoExpiry } from '@/lib/ask-brett';
import { getServiceSupabase, accountIdFor, storeEscalationPhotos, appUrl, expireUnpaid } from '@/lib/ask-brett-server';
import { getOwnedConversation, getOwnedProject, createConversation, saveTurn, storedMessage, isUuid } from '@/lib/detailing-ai-conversations';
import { askExpertConfig, askExpertVariantId, buildCheckoutUrl, paymentExpiry, storeUrl, STATUS_AWAITING_PAYMENT, ASK_EXPERT_ONE_QUESTION } from '@/lib/ask-expert-payment';
import { requireTermsAccepted } from '@/lib/detailing-ai-terms-server';

const SAVED_NOTE = `Saved for a Shiny Jets expert: ${ASK_EXPERT_ONE_QUESTION}. Brett gets it as soon as your payment goes through, and the answer comes back here and by email.`;

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Paid "Ask a Shiny Jets expert" button: $4.99 for one question answered by a Shiny Jets expert.
// GET  -> { enabled, price, price_label, status: 'available' | 'coming_soon' }
// POST -> saves the question as awaiting_payment (Brett is NOT notified) and returns the Shopify
//         checkout link. The Shopify orders/paid webhook opens it and notifies Brett.
// AI-initiated escalations stay free and keep using /api/detailing-ai/escalations.
const PUBLIC_FIELDS = 'id, conversation_id, status, reason, summary, question, created_at, payment_expires_at';

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json(askExpertConfig());
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role === 'crew') return Response.json({ error: 'Owner/staff access required' }, { status: 403 });
    const planGate = await requireFeature(request, 'detailingAi', { user });
    if (planGate) return planGate;
    const termsGate = await requireTermsAccepted(getServiceSupabase(), user);
    if (termsGate) return termsGate;

    // No product yet -> "Coming soon": never save or send a free question from the button.
    const variantId = askExpertVariantId();
    if (!variantId) return Response.json({ error: 'Paid expert questions are coming soon.', code: 'COMING_SOON', ...askExpertConfig() }, { status: 503 });

    const supabase = getServiceSupabase();
    if (!supabase) return Response.json({ error: 'Expert questions are unavailable right now.' }, { status: 503 });
    const accountId = accountIdFor(user);
    const body = await request.json().catch(() => ({}));

    const context = shapeContext(body.messages);
    if (!context.some((m) => m.role === 'user')) return Response.json({ error: 'Type your question first.', code: 'NO_QUESTION' }, { status: 400 });
    const photoCheck = validatePhotos(body.photos);
    if (!photoCheck.ok) return Response.json({ error: photoCheck.error, code: 'PHOTO_INVALID', max_photos: MAX_PHOTOS }, { status: photoCheck.status });

    await expireUnpaid(supabase, { detailerId: accountId }).catch(() => {});
    const allowance = await escalationAllowance(supabase, accountId);
    if (!allowance.ok) {
      if (allowance.which === 'unavailable') return Response.json({ error: 'Expert questions are unavailable right now.' }, { status: 503 });
      return Response.json({ error: limitReachedText(allowance.which), code: 'RATE_LIMITED', rateLimited: true }, { status: 429 });
    }

    // The question lives in a chat so Brett's answer lands in the thread: use the caller's chat,
    // or start one (in the chosen project) when they asked from a new chat.
    let conv = null;
    if (isUuid(body.conversation_id)) {
      conv = await getOwnedConversation(supabase, { id: body.conversation_id, accountId, userId: user.id });
      if (!conv) return Response.json({ error: 'Chat not found', code: 'CONVERSATION_NOT_FOUND' }, { status: 404 });
    } else {
      const project = isUuid(body.project_id) ? await getOwnedProject(supabase, { id: body.project_id, accountId, userId: user.id }).catch(() => null) : null;
      const created = await createConversation(supabase, { accountId, userId: user.id, projectId: project?.id || null }).catch((e) => ({ error: e }));
      if (!created.error) conv = created.data;
    }
    // A question typed but not sent to the AI is saved into the chat with a short note.
    const pendingText = typeof body.pending_text === 'string' ? body.pending_text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 8000) : '';
    let savedTitle = conv?.title || null;
    if (conv && (pendingText || photoCheck.images.length)) {
      const marker = photoCheck.images.length ? `[Sent ${photoCheck.images.length} photo${photoCheck.images.length === 1 ? '' : 's'}]` : '';
      const turn = await saveTurn(supabase, {
        conversation: conv,
        accountId,
        userId: user.id,
        userMsg: storedMessage({ role: 'user', content: [marker, pendingText].filter(Boolean).join('\n') || '(photo only)', display: pendingText, photoCount: photoCheck.images.length }),
        aiMsg: storedMessage({ role: 'assistant', content: SAVED_NOTE }),
      });
      if (turn.ok) savedTitle = turn.title || savedTitle;
    }

    const id = crypto.randomUUID();
    const images = photoCheck.images;
    const { paths } = await storeEscalationPhotos(supabase, { detailerId: accountId, escalationId: id, images });
    const summary = askExpertSummary(context);
    const { data: account } = await supabase.from('detailers').select('email').eq('id', accountId).maybeSingle();
    const email = user.email || account?.email || null;
    const row = {
      id,
      detailer_id: accountId,
      conversation_id: conv?.id || null,
      user_id: String(user.id),
      user_email: email,
      reason: 'user_asked',
      summary,
      question: questionFromContext(context, summary),
      context,
      ai_reply: null,
      photo_paths: paths,
      photos_expire_at: paths.length ? photoExpiry() : null,
      status: STATUS_AWAITING_PAYMENT,
      payment_expires_at: paymentExpiry(),
    };
    const { data: saved, error } = await supabase.from('detailing_ai_escalations').insert(row).select(PUBLIC_FIELDS).single();
    if (error) {
      console.error('[ask-expert] insert failed:', error.message);
      return Response.json({ error: "Couldn't save your question right now. Try again in a minute." }, { status: 500 });
    }
    const returnUrl = conv?.id ? `${appUrl()}/detailing-ai?c=${encodeURIComponent(conv.id)}` : `${appUrl()}/detailing-ai`;
    const checkoutUrl = buildCheckoutUrl({ variantId, escalationId: id, email, returnUrl, store: storeUrl() });
    return Response.json({
      escalation: { ...saved, photo_count: paths.length },
      checkout_url: checkoutUrl,
      conversation: conv ? { id: conv.id, title: savedTitle || conv.title || null, project_id: conv.project_id ?? null } : null,
      ...askExpertConfig(),
    }, { status: 201 });
  } catch (err) {
    console.error('[ask-expert] POST error:', err);
    return Response.json({ error: "Couldn't save your question right now." }, { status: 500 });
  }
}
