/**
 * Ask Brett escalation + separate Detailing AI chats.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-ask-brett.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import {
  ESCALATION_SENTENCE,
  ESCALATION_PROMPT,
  ESCALATION_LIMITS,
  PHOTO_RETENTION_DAYS,
  parseEscalateBlock,
  signEscalationTicket,
  verifyEscalationTicket,
  checkEscalationLimit,
  limitReachedText,
  replaceEscalationSentence,
  buildKnowledgeRow,
  stripPii,
  shapeContext,
  questionFromContext,
  photoExpiry,
  pollItem,
  brettEmail,
  userAnswerEmail,
  normalizeReason,
} from '../lib/ask-brett.js';
import { autoTitle, cleanTitle, storedMessage, appendMessages, MAX_SAVED_MESSAGES, isUuid } from '../lib/detailing-ai-conversations.js';
import { loadKnowledgeStub } from '../lib/detailing-ai-knowledge.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';

let failed = 0;
let total = 0;
const pending = [];
function check(name, fn) {
  total += 1;
  const run = async () => {
    try { await fn(); console.log(`PASS ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${err.message}`); }
  };
  pending.push(run);
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CONV = '33333333-3333-4333-8333-333333333333';

// ─── Prompt ───
check('prompt: exact user sentence, the three triggers, JSON shape, and safety still wins', () => {
  assert.equal(ESCALATION_SENTENCE, "I'll send this to a Shiny Jets expert, and you'll get an answer here and by email.");
  assert.ok(ESCALATION_PROMPT.includes(`say exactly: "${ESCALATION_SENTENCE}"`));
  assert.match(ESCALATION_PROMPT, /still unclear after you asked for context/);
  assert.match(ESCALATION_PROMPT, /white or very light paint/);
  assert.match(ESCALATION_PROMPT, /isn't covered by the knowledge excerpts or Shiny Jets methods/);
  assert.match(ESCALATION_PROMPT, /asks for a person \/ Brett \/ an expert/);
  assert.match(ESCALATION_PROMPT, /\{"escalate":\{"reason":/);
  assert.match(ESCALATION_PROMPT, /don't add quote suggestions/);
  assert.match(ESCALATION_PROMPT, /Never escalate instead of a safety stop/);
});

check('chat route: escalation prompt is always in the system prompt; ticket only when under the limit', () => {
  const src = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
  assert.match(src, /\+ ESCALATION_PROMPT \+/);
  assert.match(src, /escalationAllowance\(supabase, accountKey\)/);
  assert.match(src, /limitReachedText\(allowance\.which\)/);
  assert.match(src, /conversationId: conversation\?\.id/);
  assert.match(src, /brett-approved\//);
});

// ─── Parsing ───
check('parse: strips the escalate block, keeps the sentence, normalizes reason, drops suggestions', () => {
  const raw = `Thanks for the photo. White paint hides swirls in photos.\n\n${ESCALATION_SENTENCE}\n\n\`\`\`json\n{"escalate":{"reason":"white paint","summary":"Swirls or haze on white Citation fuselage?"}}\n\`\`\``;
  const r = parseEscalateBlock(raw);
  assert.deepEqual(r.escalate, { reason: 'white_paint', summary: 'Swirls or haze on white Citation fuselage?' });
  assert.ok(r.reply.endsWith(ESCALATION_SENTENCE));
  assert.ok(!r.reply.includes('escalate'));
  const withSugg = parseEscalateBlock(`Hmm.\n\`\`\`json\n{"suggestions":{"services":[{"name":"x"}]}}\n\`\`\`\n\`\`\`json\n{"escalate":{"reason":"other","summary":"s"}}\n\`\`\``);
  assert.ok(!withSugg.reply.includes('suggestions'));
});

check('parse: adds the sentence if the model forgot it; plain replies untouched', () => {
  const r = parseEscalateBlock('Not sure.\n```json\n{"escalate":{"reason":"not_in_knowledge","summary":"Is product X safe on de-ice boots?"}}\n```');
  assert.ok(r.reply.includes(ESCALATION_SENTENCE));
  const plain = parseEscalateBlock('Most likely oxidation.\n```json\n{"suggestions":{"services":[]}}\n```');
  assert.equal(plain.escalate, null);
  assert.ok(plain.reply.includes('suggestions'), 'suggestions left for parseSuggestionsBlock');
  assert.equal(normalizeReason('bogus'), 'other');
});

check('limit text replaces the promise', () => {
  const out = replaceEscalationSentence(`A\n\n${ESCALATION_SENTENCE}`, limitReachedText('day'));
  assert.ok(!out.includes(ESCALATION_SENTENCE));
  assert.match(out, /today's limit of 10 expert questions/);
});

// ─── Tickets ───
check('ticket: round-trips account, conversation, reason, summary', () => {
  const t = signEscalationTicket({ detailerId: A, userId: A, conversationId: CONV, reason: 'unclear_photo', summary: 'What is on this nacelle?' }, 1_000_000);
  const v = verifyEscalationTicket(t, { detailerId: A }, 1_000_000 + 60_000);
  assert.equal(v.ok, true);
  assert.equal(v.conversationId, CONV);
  assert.equal(v.reason, 'unclear_photo');
  assert.equal(v.summary, 'What is on this nacelle?');
});

check('ticket: another account, expired, or tampered tickets are rejected', () => {
  const t = signEscalationTicket({ detailerId: A, reason: 'other', summary: 's' }, 1_000_000);
  assert.equal(verifyEscalationTicket(t, { detailerId: B }, 1_000_000).error, 'wrong_account');
  assert.equal(verifyEscalationTicket(t, { detailerId: A }, 1_000_000 + 31 * 60_000).error, 'expired');
  const [p, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ d: B, r: 'other', s: 'x', t: 1_000_000 })).toString('base64url');
  assert.equal(verifyEscalationTicket(`${forged}.${s}`, { detailerId: B }, 1_000_000).error, 'bad_ticket');
  assert.equal(verifyEscalationTicket(`${p}.AAAA`, { detailerId: A }, 1_000_000).error, 'bad_ticket');
  assert.equal(verifyEscalationTicket('nope', { detailerId: A }).error, 'bad_ticket');
});

// ─── Rate limit ───
check(`rate limit: ${ESCALATION_LIMITS.perHour}/hour and ${ESCALATION_LIMITS.perDay}/day per account`, () => {
  const now = Date.parse('2026-10-04T12:00:00Z');
  const ago = (min) => new Date(now - min * 60_000).toISOString();
  assert.equal(checkEscalationLimit([ago(5), ago(10)], now).ok, true);
  assert.deepEqual(checkEscalationLimit([ago(5), ago(10), ago(50)], now), { ok: false, which: 'hour' });
  const day = Array.from({ length: 10 }, (_, i) => ago(70 + i * 60));
  assert.deepEqual(checkEscalationLimit(day, now), { ok: false, which: 'day' });
  assert.equal(checkEscalationLimit(Array.from({ length: 10 }, (_, i) => ago(25 * 60 + i)), now).ok, true, 'older than 24h does not count');
});

check('escalation API: per-account (detailer_id) queries, durable limit, ticket required, one row per ticket', () => {
  const src = fs.readFileSync('app/api/detailing-ai/escalations/route.js', 'utf8');
  assert.match(src, /verifyEscalationTicket\(body\.ticket, \{ detailerId: accountId \}\)/);
  assert.match(src, /escalationAllowance\(supabase, accountId\)/);
  assert.match(src, /\.eq\('detailer_id', accountId\)\s*\n\s*\.eq\('ticket_hash'/);
  assert.match(src, /\.eq\('detailer_id', accountId\)\s*\n\s*\.gte\('created_at'/);
  assert.match(src, /getOwnedConversation\(supabase, \{ id: t\.conversationId, accountId, userId: user\.id \}/);
  assert.match(src, /validatePhotos\(body\.photos\)/);
});

// ─── Photos: kept 90 days ───
check('escalation photos are kept 90 days, then the cron removes them', () => {
  assert.equal(PHOTO_RETENTION_DAYS, 90);
  const now = Date.parse('2026-10-04T00:00:00Z');
  assert.equal(photoExpiry(now), '2027-01-02T00:00:00.000Z');
  const cron = fs.readFileSync('app/api/cron/ask-brett-retention/route.js', 'utf8');
  assert.match(cron, /\.lt\('photos_expire_at'/);
  assert.match(cron, /storage\.from\(ESCALATION_BUCKET\)\.remove\(paths\)/);
  assert.match(fs.readFileSync('vercel.json', 'utf8'), /\/api\/cron\/ask-brett-retention/);
});

// ─── Shared knowledge ───
check('knowledge row: only Brett\'s general question + answer, never the detailer\'s words; PII stripped', () => {
  const detailerText = 'Haze on N123AB white G450 for Acme Jets customer Bob, quoted $4,200';
  const row = buildKnowledgeRow({ id: 'abcdef12-3456', generalQuestion: 'How do I remove polishing haze on white paint? Ask me at ana@acme.example', answer: 'That is polishing haze. Refine with a finishing pad. Call 555-123-4567.', answeredAt: '2026-10-04T10:00:00Z', question: detailerText, summary: detailerText });
  assert.equal(row.source, 'brett-answers');
  assert.equal(row.section, 'Brett-approved answer');
  assert.match(row.content, /^Question \(written by Brett\): How do I remove polishing haze on white paint\?/);
  assert.match(row.content, /Brett-approved, 2026-10-04/);
  assert.ok(!/Question from a detailer/.test(row.content));
  for (const w of ['N123AB', 'Acme Jets', 'Bob', '4,200', 'G450']) assert.ok(!JSON.stringify(row).includes(w), w);
  assert.ok(!/555-123-4567|ana@acme/.test(JSON.stringify(row)));
  assert.ok(!('detailer_id' in row) && !('user_email' in row) && !('photo_paths' in row));
  assert.ok(row.keywords.includes('haze'));
  assert.throws(() => buildKnowledgeRow({ id: 'x', generalQuestion: '  ', answer: 'a', question: detailerText }), /general question required/);
  assert.equal(stripPii('mail a@b.co'), 'mail [email]');
  const src = fs.readFileSync('lib/ask-brett.js', 'utf8');
  const fn = src.slice(src.indexOf('export function buildKnowledgeRow('), src.indexOf('// ─── Email bodies ───'));
  assert.ok(!/question\b(?!\))|summary/.test(fn.replace(/generalQuestion|general question|Question \(written by Brett\)|\/\*\*[\s\S]*?\*\//g, '')), 'buildKnowledgeRow reads no detailer text');
});

check('knowledge loader: a Brett-approved answer is picked for a matching question', async () => {
  const row = buildKnowledgeRow({ id: 'abcdef12', generalQuestion: 'How do I fix polishing haze on white paint?', answer: 'Refine with a finishing polish on a soft pad.', answeredAt: '2026-10-04T10:00:00Z' });
  const out = await loadKnowledgeStub('I see hazy polishing marks on white paint, what now?', { privateRows: [row] });
  assert.match(out, /brett-approved\/brett-answer-abcdef12/);
  assert.match(out, /Brett-approved question and answer/);
});

check('migration: tables are service-role only, photo bucket private, knowledge source allowed', () => {
  const sql = fs.readFileSync('supabase/migrations/20261005_ask_brett_escalations.sql', 'utf8');
  for (const t of ['detailing_ai_escalations', 'detailing_ai_conversations']) {
    assert.ok(sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`), t);
    assert.ok(sql.includes(`REVOKE ALL ON public.${t} FROM authenticated`), t);
    assert.ok(!new RegExp(`CREATE POLICY[^;]*${t}`).test(sql), `${t}: no policies`);
  }
  assert.match(sql, /conversation_id\s+uuid\s+REFERENCES public\.detailing_ai_conversations\(id\) ON DELETE SET NULL/);
  assert.match(sql, /'brett-answers'/);
  assert.match(sql, /'detailing-ai-escalations', 'detailing-ai-escalations', false/);
});

// ─── Admin-only + poll + webhook ───
check('admin routes check admin; poll endpoint lists open newest first; knowledge OFF unless explicitly true, needs Brett\'s general question', () => {
  const list = fs.readFileSync('app/api/admin/ask-brett/route.js', 'utf8');
  const ans = fs.readFileSync('app/api/admin/ask-brett/[id]/route.js', 'utf8');
  const poll = fs.readFileSync('app/api/admin/ask-brett/open/route.js', 'utf8');
  for (const s of [list, ans]) assert.match(s, /requireAdmin\(user, supabase\)/);
  assert.match(poll, /hasPollSecret\(request\)/);
  assert.match(poll, /requireAdmin\(await getAuthUser\(request\), supabase\)/);
  assert.match(poll, /\.eq\('status', 'open'\)\s*\n\s*\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(ans, /body\.add_to_knowledge === true/);
  assert.ok(!/add_to_knowledge !== false/.test(ans));
  assert.match(ans, /addToKnowledge && !generalQuestion\) return Response\.json\([^)]*\{ status: 400 \}/);
  assert.match(ans, /addAnswerToKnowledge\(supabase, \{ id: updated\.id, generalQuestion, answer: updated\.answer, answeredAt: updated\.answered_at \}\)/);
  const server0 = fs.readFileSync('lib/ask-brett-server.js', 'utf8');
  const add = server0.slice(server0.indexOf('export async function addAnswerToKnowledge('), server0.indexOf('export { PHOTO_RETENTION_DAYS }'));
  assert.ok(!/escalation|summary|\.question/.test(add), 'addAnswerToKnowledge never sees the escalation');
  const page = fs.readFileSync('app/admin/ask-brett/page.jsx', 'utf8');
  assert.match(page, /useState\(false\);\s*\n\s*const \[generalQuestion, setGeneralQuestion\] = useState\(''\)/);
  assert.match(page, /General question for the AI/);
  assert.ok(!/setGeneralQuestion\((item|a)\./.test(page), 'never prefilled from the detailer');
  assert.match(page, /add_to_knowledge: addToKnowledge === true/);
  assert.ok(!/Saves the question and your answer/.test(page));
  assert.match(ans, /notifyUserAnswered/);
  const server = fs.readFileSync('lib/ask-brett-server.js', 'utf8');
  assert.match(server, /ASK_BRETT_WEBHOOK_URL/);
  assert.match(server, /X-Ask-Brett-Signature/);
  assert.match(server, /timingSafeEqual/);
});

check('poll item: compact, links to the admin page, no photos or chat context', () => {
  const it = pollItem({ id: 'e1', created_at: 't', status: 'open', reason: 'white_paint', summary: 's', question: 'q'.repeat(500), photo_paths: ['a', 'b'], conversation_id: CONV, context: [{ role: 'user', content: 'x' }] }, { id: A, company: 'Acme', email: 'o@a.example' }, 'https://crm.shinyjets.com');
  assert.equal(it.admin_url, 'https://crm.shinyjets.com/admin/ask-brett?id=e1');
  assert.equal(it.photo_count, 2);
  assert.equal(it.question.length, 300);
  assert.equal(it.reason_label, 'White / light paint');
  assert.ok(!('context' in it) && !('photo_paths' in it) && !('photo_urls' in it));
});

check('emails: Brett gets a link to the queue; the user gets a link back to their own chat', () => {
  const b = brettEmail({ escalation: { id: 'e1', reason: 'unclear_photo', summary: '<b>x</b>', question: 'q', photo_paths: ['a'] }, account: { company: 'Acme' }, appUrl: 'https://crm.shinyjets.com' });
  assert.match(b.html, /admin\/ask-brett\?id=e1/);
  assert.ok(!b.html.includes('<b>x</b>'), 'escaped');
  const u = userAnswerEmail({ escalation: { conversation_id: CONV, summary: 's', answer: 'Use a finishing pad.' }, appUrl: 'https://crm.shinyjets.com' });
  assert.match(u.html, new RegExp(`/detailing-ai\\?c=${CONV}`));
  assert.match(u.text, /Use a finishing pad\./);
});

// ─── Context ───
check('context: last turns only, capped; question from the user turns without the photo marker', () => {
  const ctx = shapeContext([{ role: 'assistant', content: 'hi' }, { role: 'user', content: '[Sent 2 photos]\nWhat is this on the nacelle?' }, { role: 'system', content: 'x' }]);
  assert.equal(ctx.length, 2);
  assert.equal(questionFromContext(ctx, 's'), 'What is this on the nacelle?');
  assert.equal(questionFromContext([], 'summary only'), 'summary only');
});

// ─── Separate chats ───
check('chats: auto titles from the first question', () => {
  assert.equal(autoTitle('[Sent 2 photos]\nwhat is this on the leading edge?'), 'What is this on the leading edge?');
  assert.equal(autoTitle('', 2), 'Photo question (2 photos)');
  const long = autoTitle('Paint looks chalky on a G550 top after the last wash, is that oxidation or clearcoat failure and how do I quote it');
  assert.ok(long.length <= 61 && long.endsWith('…'), long);
  assert.equal(cleanTitle('  a\n b  '), 'a b');
  assert.equal(cleanTitle('x'.repeat(200)).length, 80);
});

check('chats: stored messages carry no photo data; history capped', () => {
  const m = storedMessage({ role: 'user', content: '[Sent 1 photo]\nhi', display: 'hi', photoCount: 1 });
  assert.equal(m.photo_count, 1);
  assert.ok(!JSON.stringify(m).includes('base64'));
  const many = appendMessages(Array.from({ length: 120 }, (_, i) => ({ i })), [{ i: 'new' }]);
  assert.equal(many.length, MAX_SAVED_MESSAGES);
  assert.equal(many[many.length - 1].i, 'new');
  assert.equal(isUuid(CONV), true);
  assert.equal(isUuid('../x'), false);
});

check('chat APIs are scoped to account + user', () => {
  const lib = fs.readFileSync('lib/detailing-ai-conversations.js', 'utf8');
  assert.equal((lib.match(/\.eq\('detailer_id', accountId\)\s*\n\s*\.eq\('user_id', String\(userId\)\)/g) || []).length, 6, 'list, get, summary, projects list + get, save turn');
  const one = fs.readFileSync('app/api/detailing-ai/conversations/[id]/route.js', 'utf8');
  assert.equal((one.match(/\.eq\('detailer_id', c\.accountId\)\s*\n\s*\.eq\('user_id', String\(c\.user\.id\)\)/g) || []).length, 2, 'rename + delete');
  assert.match(one, /getOwnedConversation\(c\.supabase/);
});

check('page: New chat, chat list with rename/delete, phone drawer dialog, expert cards, announcements', () => {
  const page = fs.readFileSync('app/detailing-ai/page.jsx', 'utf8');
  assert.match(page, /New chat/);
  assert.match(page, /aria-label=\{`Rename chat: \$\{c\.title\}`\}/);
  assert.match(page, /aria-label=\{`Delete chat: \$\{c\.title\}`\}/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /e\.key === 'Escape'/);
  assert.match(page, /Shiny Jets expert · Brett/);
  assert.match(page, /You&apos;ll get it here and by email/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /\/api\/detailing-ai\/escalations/);
  assert.match(page, /conversation_id: activeId/);
  assert.match(page, /\?c=\$\{encodeURIComponent\(id\)\}/);
});

check('admin page: phone-first form, "Add to AI knowledge" OFF by default, labelled controls', () => {
  const page = fs.readFileSync('app/admin/ask-brett/page.jsx', 'utf8');
  assert.match(page, /const \[addToKnowledge, setAddToKnowledge\] = useState\(false\)/);
  assert.match(page, /htmlFor=\{`gq-\$\{item\.id\}`\}/);
  assert.match(page, /aria-describedby=\{`gq-help-\$\{item\.id\}`\}/);
  assert.match(page, /Add to AI knowledge/);
  assert.match(page, /htmlFor=\{`answer-\$\{item\.id\}`\}/);
  assert.match(page, /htmlFor=\{`kb-\$\{item\.id\}`\}/);
  assert.match(page, /min-h-\[48px\]/);
  assert.match(page, /Admins only|admins only/);
});

for (const run of pending) await run();
console.log(`\n${total - failed}/${total} passed`);
if (failed) process.exit(1);
