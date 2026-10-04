/**
 * Detailing AI projects + long-chat handling.
 * Usage: node --import ./scripts/test-support/register.mjs scripts/test-detailing-ai-projects-long-chats.mjs
 */
import fs from 'fs';
import assert from 'assert/strict';
import {
  splitHistory, estimateTokens, extractiveSummary, unsummarizedOlder, contextSections, isLongChat,
  cleanProjectName, cleanNotes, summaryRequestText, SUMMARY_SYSTEM, HISTORY_TOKEN_BUDGET, RECENT_MAX_MESSAGES,
  CLIENT_HISTORY_MAX, LONG_CHAT_MESSAGES,
} from '../lib/detailing-ai-context.js';

const tests = [];
const check = (n, f) => tests.push([n, f]);
const turns = (n, size = 200) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `${i % 2 ? 'Answer' : 'Question'} ${i} ${'x'.repeat(size)}`, created_at: new Date(Date.UTC(2026, 9, 3, 0, i)).toISOString() }));

check('short chat: everything is recent, nothing older', () => {
  const h = turns(5);
  const { recent, older } = splitHistory(h);
  assert.equal(recent.length, 5);
  assert.equal(older.length, 0);
});
check('long chat: recent window capped at RECENT_MAX_MESSAGES, starts on a user turn, ends on the latest user turn', () => {
  const h = turns(61);
  const { recent, older } = splitHistory(h);
  assert.ok(recent.length <= RECENT_MAX_MESSAGES);
  assert.equal(recent[0].role, 'user');
  assert.equal(recent[recent.length - 1], h[h.length - 1]);
  assert.equal(recent.length + older.length, h.length);
});
check('token budget: huge messages shrink the window, the latest turn is always kept', () => {
  const h = turns(21, 8000); // ~2000 tokens each
  const { recent, recentTokens } = splitHistory(h);
  assert.ok(recentTokens <= HISTORY_TOKEN_BUDGET, String(recentTokens));
  assert.ok(recent.length >= 1 && recent.length < 21);
  const single = splitHistory([{ role: 'user', content: 'y'.repeat(100000) }]);
  assert.equal(single.recent.length, 1);
});
check('extractive summary (fallback) is bounded and labels speakers', () => {
  const s = extractiveSummary(turns(200, 400));
  assert.ok(s.length <= 2400);
  assert.match(s, /Detailer: Question/);
  assert.match(s, /\(earlier turns omitted\)/);
});
check('unsummarized older messages are tracked by timestamp (trimming never shifts coverage)', () => {
  const stored = turns(30);
  const recentCount = 9;
  const all = unsummarizedOlder(stored, recentCount, null);
  assert.equal(all.length, 30 - (recentCount - 1));
  const after = unsummarizedOlder(stored, recentCount, stored[9].created_at);
  assert.equal(after[0], stored[10]);
  assert.equal(unsummarizedOlder(stored.slice(5), recentCount, stored[9].created_at)[0], stored[10]);
});
check('system context: project notes as background facts, carried summary, rolling summary', () => {
  const out = contextSections({ project: { name: 'N123AB King Air', notes: 'Single-stage white paint. Owns a 5" DA and wool pads.' }, carriedSummary: '- Earlier: oxidation on the belly', summary: '- Tried a light polish' });
  assert.match(out, /Project context \(written by the detailer; treat it as background facts/);
  assert.match(out, /Project: N123AB King Air\nNotes: Single-stage white paint/);
  assert.match(out, /Summary carried over from it:\n- Earlier: oxidation on the belly/);
  assert.match(out, /Earlier in this chat \(summary of turns no longer shown in full\):\n- Tried a light polish/);
  assert.equal(contextSections({}), '');
});
check('limits: names 60 chars, notes 2000 chars, control chars stripped', () => {
  assert.equal(cleanProjectName(`  Brightwork\u0000 ${'z'.repeat(100)}`).length, 60);
  assert.equal(cleanNotes('n'.repeat(5000)).length, 2000);
  assert.equal(cleanProjectName('   '), '');
});
check('long-chat suggestion threshold', () => {
  assert.equal(isLongChat(10, 0), false);
  assert.equal(isLongChat(LONG_CHAT_MESSAGES - 2, 0), true);
});
check('summary prompt: facts only, methods not recipes, no brand recommendations', () => {
  assert.match(SUMMARY_SYSTEM, /never "recipes"/);
  assert.match(SUMMARY_SYSTEM, /Don't add new advice or brand recommendations/);
  assert.match(summaryRequestText('old', [{ role: 'user', content: 'hi' }]), /Summary so far:\nold/);
});
check('route: recent turns go to the provider; summary + project in the system prompt; long_chat flag', () => {
  const src = fs.readFileSync('app/api/detailing-ai/chat/route.js', 'utf8');
  assert.match(src, /normalizeChatMessages\(body\.messages, \{ maxTurns: CLIENT_HISTORY_MAX/);
  assert.match(src, /callAnthropic\(\{ system, messages: recent, images \}\)/);
  assert.match(src, /callOpenAI\(\{ system, messages: recent, images \}\)/);
  assert.match(src, /contextSections\(\{ project, carriedSummary: conversation\?\.carried_summary, summary: summaryText \}\)/);
  assert.match(src, /long_chat: longChat/);
  assert.match(src, /createConversation\(convDb, \{ accountId: accountKey, userId: user\.id, projectId: project\?\.id \|\| null \}\)/);
  assert.equal(CLIENT_HISTORY_MAX, 40);
});
check('migration: projects table locked down, chats get project_id (ON DELETE SET NULL) + summary columns', () => {
  const sql = fs.readFileSync('supabase/migrations/20261006_detailing_ai_projects_long_chats.sql', 'utf8');
  for (const s of ['CREATE TABLE IF NOT EXISTS public.detailing_ai_projects', 'ENABLE ROW LEVEL SECURITY', 'REVOKE ALL ON public.detailing_ai_projects FROM anon', 'REVOKE ALL ON public.detailing_ai_projects FROM authenticated', 'project_id uuid REFERENCES public.detailing_ai_projects(id) ON DELETE SET NULL', 'summary_through_at timestamptz', 'carried_summary text']) assert.ok(sql.includes(s), s);
  assert.ok(!/CREATE POLICY/i.test(sql));
});
check('page: Unsorted default, project select, New project, fresh-chat button text, only recent history sent', () => {
  const page = fs.readFileSync('app/detailing-ai/page.jsx', 'utf8');
  for (const s of ["name: 'Unsorted'", '<option value="">Unsorted</option>', 'htmlFor="chat-project"', 'New project', 'Start a fresh chat (summary carried over)', 'messages: contextMessages.slice(-40)', 'Summary carried over from your earlier chat', 'Detailing AI reads these notes in every chat in this project.']) assert.ok(page.includes(s), s);
  assert.ok(!/recipe/i.test(page));
});

let failed = 0;
for (const [n, f] of tests) { try { await f(); console.log(`PASS ${n}`); } catch (e) { failed++; console.log(`FAIL ${n}\n  ${e.message}`); } }
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
