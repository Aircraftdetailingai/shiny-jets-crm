// "Ask Brett" escalation for Detailing AI (CRM /detailing-ai and standalone buyers, which use
// the same page). When the AI can't answer confidently it says ESCALATION_SENTENCE and emits an
// {"escalate":{...}} block; the chat route turns that into a short-lived signed ticket, and the
// page posts the ticket + the conversation's photos to /api/detailing-ai/escalations.
//
// Data rules:
//   * Every escalation row belongs to one account (detailer_id). Users only ever read their own
//     account's rows; only admins (lib/plan-gate isAdminDetailer) read the queue.
//   * Photos attached to an escalation ARE kept (private storage bucket), for PHOTO_RETENTION_DAYS,
//     then removed by /api/cron/ask-brett-retention. Normal chat photos are still never stored.
//   * The AI is not crowd-sourced. "Add to AI knowledge" is OFF unless Brett ticks it, and then
//     saves only a general question Brett writes himself + his answer to the shared
//     private_knowledge table (source 'brett-answers'). The detailer's own words (question,
//     AI summary, chat), account id, name, email and photos are never saved there.
import crypto from 'crypto';

export const ESCALATION_SENTENCE = "I'll send this to a Shiny Jets expert, and you'll get an answer here and by email.";
export const ESCALATION_REASONS = ['unclear_photo', 'white_paint', 'not_in_knowledge', 'user_asked', 'other'];
export const REASON_LABELS = {
  unclear_photo: 'Unclear photo',
  white_paint: 'White / light paint',
  not_in_knowledge: 'Not in AI knowledge',
  user_asked: 'Paid expert question ($4.99)',
  other: 'Other',
};
export const ESCALATION_LIMITS = { perHour: 3, perDay: 10 };
export const PHOTO_RETENTION_DAYS = 90;
export const TICKET_TTL_MS = 30 * 60 * 1000;
export const ESCALATION_BUCKET = 'detailing-ai-escalations';
export const KNOWLEDGE_SOURCE = 'brett-answers';
export const MAX_QUESTION_CHARS = 2000;
export const MAX_ANSWER_CHARS = 6000;
export const MAX_GENERAL_QUESTION_CHARS = 300;
export const MAX_CONTEXT_TURNS = 12;
export const MAX_CONTEXT_CHARS = 1500;

export const ESCALATION_PROMPT = `

Ask a Shiny Jets expert (escalation):
- Don't guess when you can't answer confidently. Escalate when: a photo is still unclear after you asked for context (or a closer / better-lit shot didn't help); the photo shows white or very light paint where swirls, haze or defects can't be judged from a photo; or the question isn't covered by the knowledge excerpts or Shiny Jets methods (an unfamiliar product, aircraft, coating or procedure) and a wrong answer could cost the detailer money or damage the aircraft. These escalations are free.
- A first unclear photo still gets the photo rule (thanks, best guess, ask for context). Escalate on the follow-up if it's still unclear, or right away for white paint.
- If the detailer asks for a person / Brett / an expert but you CAN answer, answer it, then mention they can tap "Ask a Shiny Jets expert" ($4.99 for one question answered by a Shiny Jets expert). Don't escalate just because they asked.
- When you escalate, say exactly: "${ESCALATION_SENTENCE}" Add at most one safe interim step (for example, don't start polishing until you hear back, or do a small test spot). Don't give a full method you aren't confident in, and don't add quote suggestions.
- Then append EXACTLY one fenced JSON block instead of the suggestions block:
\`\`\`json
{"escalate":{"reason":"unclear_photo | white_paint | not_in_knowledge | user_asked | other","summary":"one line: the question the expert should answer"}}
\`\`\`
- Never escalate instead of a safety stop: structural damage, cracking acrylic or corrosion beyond polish still get "stop and involve maintenance" right away.`;

// "Ask a Shiny Jets expert" button: PAID ($4.99 for one question, lib/ask-expert-payment.js).
// The question is saved as awaiting_payment and only reaches Brett after Shopify says it's paid.
// AI-initiated escalations above stay free. The summary is the detailer's latest real question.
export const ASK_EXPERT_BUTTON_TEXT = 'Ask a Shiny Jets expert';

export function askExpertSummary(messages) {
  const users = (Array.isArray(messages) ? messages : []).filter((m) => m && m.role === 'user');
  let photos = false;
  for (let i = users.length - 1; i >= 0; i--) {
    const raw = typeof users[i].content === 'string' ? users[i].content : '';
    if (/^\[Sent \d+ photos?\]/.test(raw)) photos = true;
    const t = raw.replace(/^\[Sent \d+ photos?\]\s*/, '').replace(/\s+/g, ' ').trim();
    if (!t || t.toLowerCase() === ASK_EXPERT_BUTTON_TEXT.toLowerCase()) continue;
    return t.slice(0, 300);
  }
  return photos ? 'Photo question (see the attached photos)' : 'The detailer asked for a Shiny Jets expert';
}

/** A reply in the same shape the model uses, so the normal escalation path files it. */
export function askExpertRawReply(messages) {
  const block = JSON.stringify({ escalate: { reason: 'user_asked', summary: askExpertSummary(messages) } });
  return `${ESCALATION_SENTENCE}\n\n\`\`\`json\n${block}\n\`\`\``;
}

export function normalizeReason(r) {
  const s = String(r || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  return ESCALATION_REASONS.includes(s) ? s : 'other';
}

/**
 * Pull the {"escalate":{...}} block out of a model reply.
 * Returns { reply, escalate } where escalate is { reason, summary } or null.
 * The reply always carries ESCALATION_SENTENCE when escalate is set.
 */
export function parseEscalateBlock(raw) {
  if (!raw || typeof raw !== 'string') return { reply: raw || '', escalate: null };
  let found = null;
  let cut = null;
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed && parsed.escalate && typeof parsed.escalate === 'object') { found = parsed.escalate; cut = [m.index, m[0].length]; }
    } catch { /* not JSON */ }
  }
  if (!found) {
    const bare = raw.match(/\{\s*"escalate"\s*:\s*\{[\s\S]*?\}\s*\}\s*$/);
    if (bare) {
      try { found = JSON.parse(bare[0]).escalate; cut = [bare.index, bare[0].length]; } catch { /* ignore */ }
    }
  }
  if (!found) return { reply: raw, escalate: null };
  let reply = (raw.slice(0, cut[0]) + raw.slice(cut[0] + cut[1])).trim();
  // Never show quote suggestions on an escalated answer.
  reply = reply.replace(/```(?:json)?\s*\{\s*"suggestions"[\s\S]*?```/gi, '').trim();
  if (!reply.includes(ESCALATION_SENTENCE)) reply = `${reply}${reply ? '\n\n' : ''}${ESCALATION_SENTENCE}`;
  const summary = String(found.summary || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { reply, escalate: { reason: normalizeReason(found.reason), summary } };
}

/** Text that replaces the escalation sentence when the account can't escalate right now. */
export function limitReachedText(which) {
  return which === 'hour'
    ? `I'd normally send this to a Shiny Jets expert, but you've sent ${ESCALATION_LIMITS.perHour} expert questions in the last hour. Ask again in a little while and I'll pass it on.`
    : `I'd normally send this to a Shiny Jets expert, but you've reached today's limit of ${ESCALATION_LIMITS.perDay} expert questions. Ask again tomorrow and I'll pass it on.`;
}

export function replaceEscalationSentence(reply, replacement) {
  return String(reply || '').split(ESCALATION_SENTENCE).join(replacement);
}

// ─── Signed tickets: only an AI escalation can create a queue item ───
function ticketSecret() {
  const s = process.env.ASK_BRETT_TICKET_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error('ticket secret not configured');
  return s;
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signEscalationTicket({ detailerId, userId, conversationId = null, reason, summary }, now = Date.now()) {
  const payload = b64u(JSON.stringify({ d: String(detailerId), u: userId ? String(userId) : null, c: conversationId ? String(conversationId) : null, r: normalizeReason(reason), s: String(summary || '').slice(0, 300), t: now }));
  const sig = b64u(crypto.createHmac('sha256', ticketSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyEscalationTicket(ticket, { detailerId }, now = Date.now()) {
  if (typeof ticket !== 'string' || ticket.length > 2000 || !ticket.includes('.')) return { ok: false, error: 'bad_ticket' };
  const [payload, sig] = ticket.split('.');
  let expected;
  try { expected = crypto.createHmac('sha256', ticketSecret()).update(payload).digest(); } catch { return { ok: false, error: 'bad_ticket' }; }
  const given = Buffer.from(sig || '', 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, error: 'bad_ticket' };
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return { ok: false, error: 'bad_ticket' }; }
  if (String(data.d) !== String(detailerId)) return { ok: false, error: 'wrong_account' };
  if (!Number.isFinite(data.t) || now - data.t > TICKET_TTL_MS || data.t - now > 60_000) return { ok: false, error: 'expired' };
  return { ok: true, reason: normalizeReason(data.r), summary: data.s || '', userId: data.u || null, conversationId: data.c || null, issuedAt: data.t };
}

// ─── Rate limit (durable: counted from the table, per account) ───
export function checkEscalationLimit(createdAtList, now = Date.now()) {
  const times = (createdAtList || []).map((t) => new Date(t).getTime()).filter(Number.isFinite);
  const lastHour = times.filter((t) => now - t < 60 * 60 * 1000).length;
  const lastDay = times.filter((t) => now - t < 24 * 60 * 60 * 1000).length;
  if (lastHour >= ESCALATION_LIMITS.perHour) return { ok: false, which: 'hour' };
  if (lastDay >= ESCALATION_LIMITS.perDay) return { ok: false, which: 'day' };
  return { ok: true };
}

export async function escalationAllowance(supabase, detailerId, now = Date.now()) {
  if (!supabase || !detailerId) return { ok: false, which: 'unavailable' };
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('detailing_ai_escalations')
    .select('created_at')
    .eq('detailer_id', detailerId)
    .gte('created_at', since)
    .limit(ESCALATION_LIMITS.perDay + 1);
  if (error) return { ok: false, which: 'unavailable', error: error.message };
  return checkEscalationLimit((data || []).map((r) => r.created_at), now);
}

// ─── Context + question shaping ───
export function shapeContext(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_CONTEXT_TURNS)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CONTEXT_CHARS) }));
}

export function questionFromContext(context, summary) {
  const users = context.filter((m) => m.role === 'user').map((m) => m.content.replace(/^\[Sent \d+ photos?\]\s*/, '').trim()).filter(Boolean);
  const q = users.slice(-3).join('\n\n') || summary || '(photo only)';
  return q.slice(0, MAX_QUESTION_CHARS);
}

export function photoExpiry(now = Date.now()) {
  return new Date(now + PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ─── Shared knowledge entry (no account data) ───
const STRIP_PII = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  [/\+?\d[\d\s().-]{7,}\d/g, '[phone]'],
];
export function stripPii(s) {
  let out = String(s || '');
  for (const [re, rep] of STRIP_PII) out = out.replace(re, rep);
  return out;
}

const KW_STOP = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'you', 'are', 'how', 'what', 'this', 'that', 'into', 'not', 'can', 'use', 'should', 'would', 'about', 'there', 'they', 'have', 'has', 'was', 'were', 'will', 'just', 'like', 'photo', 'photos', 'sent', 'looks', 'look', 'does', 'any', 'get', 'its', "it's", 'our', 'out', 'but', 'too', 'very']);
export function knowledgeKeywords(...texts) {
  const counts = new Map();
  for (const t of texts) {
    for (const w of String(t || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length < 4 || KW_STOP.has(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([w]) => w);
}

/**
 * Shared knowledge row from Brett's own general question + his answer. Takes ONLY those two
 * texts: the detailer's question, the AI summary and the chat are never passed in, so none of
 * the detailer's words can reach the shared knowledge. stripPii stays as an extra safeguard.
 */
export function buildKnowledgeRow({ id, generalQuestion, answer, answeredAt = new Date() }) {
  const q = stripPii(generalQuestion).replace(/\s+/g, ' ').trim().slice(0, MAX_GENERAL_QUESTION_CHARS);
  if (!q) throw new Error('general question required');
  const a = stripPii(answer).trim().slice(0, MAX_ANSWER_CHARS);
  const date = new Date(answeredAt).toISOString().slice(0, 10);
  return {
    slug: `brett-answer-${String(id).slice(0, 8)}-${date}`,
    source: KNOWLEDGE_SOURCE,
    title: q,
    section: 'Brett-approved answer',
    keywords: knowledgeKeywords(q, a),
    content: `Question (written by Brett): ${q}\n\nBrett's answer (Brett-approved, ${date}):\n${a}`,
  };
}

// ─── Email bodies ───
export function escapeHtmlText(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const para = (s) => escapeHtmlText(s).replace(/\n/g, '<br>');

export function brettEmail({ escalation, account, appUrl }) {
  const link = `${appUrl}/admin/ask-brett?id=${escalation.id}`;
  const who = [account?.company, account?.name, account?.email].filter(Boolean).join(' · ') || 'A detailer';
  const n = escalation.photo_paths?.length || 0;
  const subject = `Ask Brett: ${REASON_LABELS[escalation.reason] || 'Question'} from ${account?.company || account?.email || 'a detailer'}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p><strong>New Detailing AI question for you</strong> (${escapeHtmlText(REASON_LABELS[escalation.reason] || 'Other')})</p>
<p><strong>From:</strong> ${escapeHtmlText(who)}</p>
${escalation.paid || escalation.shopify_order_id ? `<p><strong>Paid question</strong> ($4.99, one question${escalation.shopify_order_name ? `, Shopify order ${escapeHtmlText(escalation.shopify_order_name)}` : ''}).</p>` : '<p>Free: Detailing AI couldn\u2019t answer this one.</p>'}
${escalation.summary ? `<p><strong>Summary:</strong> ${para(escalation.summary)}</p>` : ''}
<p><strong>Question:</strong><br>${para(escalation.question)}</p>
${escalation.ai_reply ? `<p style="color:#555"><strong>What the AI said:</strong><br>${para(escalation.ai_reply)}</p>` : ''}
<p>${n ? `${n} photo${n === 1 ? '' : 's'} attached.` : 'No photos.'}</p>
<p><a href="${link}" style="display:inline-block;background:#007cb1;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Answer in the Ask Brett queue</a></p>
</div>`;
  const text = `New Detailing AI question (${REASON_LABELS[escalation.reason] || 'Other'})${escalation.paid || escalation.shopify_order_id ? ' [PAID $4.99, one question]' : ' [free AI escalation]'}\nFrom: ${who}\n${escalation.summary ? `Summary: ${escalation.summary}\n` : ''}Question: ${escalation.question}\n\nAnswer it: ${link}`;
  return { subject, html, text };
}

export function chatLink(appUrl, conversationId) {
  return conversationId ? `${appUrl}/detailing-ai?c=${encodeURIComponent(conversationId)}` : `${appUrl}/detailing-ai`;
}

export function userAnswerEmail({ escalation, appUrl }) {
  const link = chatLink(appUrl, escalation.conversation_id);
  const subject = 'A Shiny Jets expert answered your Detailing AI question';
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>A Shiny Jets expert answered the question you asked Detailing AI.</p>
<p><strong>Your question:</strong><br>${para(escalation.summary || escalation.question)}</p>
<p><strong>Answer from Brett at Shiny Jets:</strong><br>${para(escalation.answer)}</p>
<p><a href="${link}" style="display:inline-block;background:#007cb1;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open this chat in Detailing AI</a></p>
<p style="color:#555;font-size:13px">Detailing AI and expert answers are advisory only and don't replace OEM manuals or A&amp;P/IA judgment.</p>
</div>`;
  const text = `A Shiny Jets expert answered your Detailing AI question.\n\nYour question: ${escalation.summary || escalation.question}\n\nAnswer from Brett at Shiny Jets:\n${escalation.answer}\n\nOpen this chat: ${link}`;
  return { subject, html, text };
}

/** Compact item for the Chief of Staff poll endpoint and the webhook (no photos, no full context). */
export function pollItem(e, account, appUrl) {
  return {
    id: e.id,
    created_at: e.created_at,
    status: e.status,
    reason: e.reason,
    reason_label: REASON_LABELS[e.reason] || 'Other',
    paid: !!(e.paid || e.shopify_order_id),
    summary: e.summary || null,
    question: String(e.question || '').slice(0, 300),
    photo_count: Array.isArray(e.photo_paths) ? e.photo_paths.length : (e.photo_count || 0),
    account: account ? { id: account.id, company: account.company || null, name: account.name || null, email: account.email || null, plan: account.plan || null } : null,
    conversation_id: e.conversation_id || null,
    admin_url: `${appUrl}/admin/ask-brett?id=${e.id}`,
  };
}
