// Public: one chat turn. Answers ONLY from this account's FAQs.
import { getServiceSupabase, loadChatAccount, chatSettingsOf, chatEligible, loadAccountFaqs } from '@/lib/ai-chat-server';
import {
  retrieveFaqs, strongFaqMatch, buildSystemPrompt, guardReply, sanitizeTranscript, createRateLimiter, clientIp,
  NOT_COVERED_REPLY, MAX_VISITOR_MESSAGE,
} from '@/lib/ai-chat';
import { normalizeChatMessages } from '@/lib/detailing-ai-messages';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Per server instance. Bounded cost: Haiku, 300 output tokens, <= 5 FAQs.
const perIp = createRateLimiter({ limit: 20, windowMs: 5 * 60 * 1000 });
const perAccount = createRateLimiter({ limit: 300, windowMs: 60 * 60 * 1000 });

const MODEL = process.env.AI_CHAT_MODEL || 'claude-haiku-4-5-20251001';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const supabase = getServiceSupabase();
  const detailer = await loadChatAccount(supabase, body?.account);
  if (!detailer) return Response.json({ error: 'Not found' }, { status: 404 });
  if (!chatEligible(detailer) || !chatSettingsOf(detailer).enabled) {
    return Response.json({ error: 'Chat is not available for this business.' }, { status: 403 });
  }

  const ip = clientIp(request);
  const a = perAccount.check(detailer.id);
  const b = perIp.check(`${detailer.id}:${ip}`);
  if (!a.ok || !b.ok) {
    const retryAfter = Math.max(a.retryAfter || 0, b.retryAfter || 0);
    return Response.json({ error: 'You’re sending messages too quickly. Please wait a moment and try again.', rateLimited: true },
      { status: 429, headers: { 'Retry-After': String(retryAfter || 60) } });
  }

  const history = sanitizeTranscript(body?.messages, { maxTurns: 12 });
  const turns = normalizeChatMessages(history, { maxTurns: 8, maxChars: MAX_VISITOR_MESSAGE * 3 });
  const latest = turns.filter((m) => m.role === 'user').slice(-1)[0]?.content || '';
  if (!latest) return Response.json({ error: 'Type a question first.' }, { status: 400 });

  const faqs = await loadAccountFaqs(supabase, detailer.id);
  const hits = retrieveFaqs(faqs, latest, { k: 5 });
  if (!hits.length) return Response.json({ reply: NOT_COVERED_REPLY, covered: false });

  // Deterministic answer when the model is unavailable: only a strong match.
  const fallback = () => {
    const faq = strongFaqMatch(hits, latest);
    return Response.json(faq ? guardReply(faq.answer) : { reply: NOT_COVERED_REPLY, covered: false });
  };

  if (!process.env.ANTHROPIC_API_KEY) return fallback();

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        temperature: 0,
        system: buildSystemPrompt({ company: detailer.company || detailer.name, faqs: hits.map((h) => h.faq) }),
        messages: turns,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error('[ai-chat] provider error', res.status, (await res.text()).slice(0, 300));
      return fallback();
    }
    const data = await res.json();
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    console.log('[ai-chat] usage', JSON.stringify({ account: detailer.id, in: data.usage?.input_tokens, out: data.usage?.output_tokens }));
    return Response.json(guardReply(text));
  } catch (e) {
    console.error('[ai-chat] provider exception', e?.message || e);
    return fallback();
  }
}
