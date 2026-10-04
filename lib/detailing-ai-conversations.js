// Detailing AI conversations: separate, saved chats per user (scoped to account + user).
// Chat photos are never stored here, only a count per message.
export const MAX_SAVED_MESSAGES = 100;
export const MAX_SAVED_CHARS = 8000;
export const MAX_TITLE_CHARS = 80;
export const LIST_LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s) => UUID.test(String(s || ''));

export function stripPhotoMarker(s) {
  return String(s || '').replace(/^\[Sent \d+ photos?\]\s*/, '').trim();
}

/** Auto title from the first question: first ~60 chars on a word boundary. */
export function autoTitle(firstUserText, photoCount = 0) {
  const t = stripPhotoMarker(firstUserText).replace(/\s+/g, ' ').trim();
  if (!t) return photoCount ? `Photo question (${photoCount} photo${photoCount === 1 ? '' : 's'})` : 'New chat';
  if (t.length <= 60) return t.charAt(0).toUpperCase() + t.slice(1);
  const cut = t.slice(0, 60);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 30 ? cut.slice(0, sp) : cut).replace(/[\s,.;:!?-]+$/, '')}…`.replace(/^./, (c) => c.toUpperCase());
}

export function cleanTitle(s) {
  return String(s || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS);
}

/** Shape a message for storage (no photo data, capped text). */
export function storedMessage({ role, content, display, photoCount = 0, suggestions = null, escalation = null, at = new Date() }) {
  const m = { role, content: String(content || '').slice(0, MAX_SAVED_CHARS), created_at: new Date(at).toISOString() };
  if (display !== undefined && display !== content) m.display = String(display || '').slice(0, MAX_SAVED_CHARS);
  if (photoCount) m.photo_count = photoCount;
  if (suggestions) m.suggestions = suggestions;
  if (escalation) m.escalation = escalation;
  return m;
}

export function appendMessages(existing, added) {
  return [...(Array.isArray(existing) ? existing : []), ...added].slice(-MAX_SAVED_MESSAGES);
}

// ─── Server helpers (pass a service-role supabase client) ───
// Projects + long-chat columns come from migration 20261006. Until it runs, every helper falls
// back to the base columns so saved chats keep working.
const LIST_FIELDS = 'id, title, created_at, updated_at';
const LIST_FIELDS_V2 = `${LIST_FIELDS}, project_id`;
const CONV_FIELDS = 'id, title, messages, created_at, updated_at';
export const CONV_FIELDS_V2 = `${CONV_FIELDS}, project_id, summary, summary_through_at, carried_summary, carried_from`;
const missingColumn = (error) => !!error && /column|schema cache|does not exist|42703|PGRST204/i.test(`${error.code || ''} ${error.message || ''}`);

export async function listConversations(supabase, { accountId, userId }) {
  const run = (fields) => supabase
    .from('detailing_ai_conversations')
    .select(fields)
    .eq('detailer_id', accountId)
    .eq('user_id', String(userId))
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT);
  let { data, error } = await run(LIST_FIELDS_V2);
  if (missingColumn(error)) ({ data, error } = await run(LIST_FIELDS));
  return { data: data || [], error };
}

export async function getOwnedConversation(supabase, { id, accountId, userId }, fields = CONV_FIELDS_V2) {
  if (!isUuid(id)) return null;
  const run = (f) => supabase
    .from('detailing_ai_conversations')
    .select(f)
    .eq('id', id)
    .eq('detailer_id', accountId)
    .eq('user_id', String(userId))
    .maybeSingle();
  let { data, error } = await run(fields);
  if (missingColumn(error) && fields === CONV_FIELDS_V2) ({ data } = await run(CONV_FIELDS));
  return data || null;
}

export async function createConversation(supabase, { accountId, userId, title = null, projectId = null, carriedSummary = null, carriedFrom = null, messages = [] }) {
  const base = { detailer_id: accountId, user_id: String(userId), title: title ? cleanTitle(title) : null, messages };
  const extra = {};
  if (projectId) extra.project_id = projectId;
  if (carriedSummary) extra.carried_summary = carriedSummary;
  if (carriedFrom) extra.carried_from = carriedFrom;
  const run = (row, f) => supabase.from('detailing_ai_conversations').insert(row).select(f).single();
  let { data, error } = await run({ ...base, ...extra }, CONV_FIELDS_V2);
  if (missingColumn(error)) ({ data, error } = await run(base, CONV_FIELDS));
  return { data, error };
}

/** Save the rolling summary (ignored if the long-chat columns aren't there yet). */
export async function saveSummary(supabase, { id, accountId, userId, summary, throughAt }) {
  try {
    const { error } = await supabase
      .from('detailing_ai_conversations')
      .update({ summary, summary_through_at: throughAt })
      .eq('id', id)
      .eq('detailer_id', accountId)
      .eq('user_id', String(userId));
    return !error;
  } catch {
    return false;
  }
}

// ─── Projects ───
export const PROJECT_FIELDS = 'id, name, notes, created_at, updated_at';
export const PROJECT_LIMIT = 50;

export async function listProjects(supabase, { accountId, userId }) {
  const { data, error } = await supabase
    .from('detailing_ai_projects')
    .select(PROJECT_FIELDS)
    .eq('detailer_id', accountId)
    .eq('user_id', String(userId))
    .order('name', { ascending: true })
    .limit(PROJECT_LIMIT);
  return { data: data || [], error };
}

export async function getOwnedProject(supabase, { id, accountId, userId }) {
  if (!isUuid(id)) return null;
  const { data } = await supabase
    .from('detailing_ai_projects')
    .select(PROJECT_FIELDS)
    .eq('id', id)
    .eq('detailer_id', accountId)
    .eq('user_id', String(userId))
    .maybeSingle();
  return data || null;
}

/** Append a user turn + AI reply; sets the auto title on the first turn. Never throws. */
export async function saveTurn(supabase, { conversation, accountId, userId, userMsg, aiMsg }) {
  try {
    const messages = appendMessages(conversation.messages, [userMsg, aiMsg]);
    const patch = { messages, updated_at: new Date().toISOString() };
    if (!conversation.title) patch.title = autoTitle(userMsg.display ?? userMsg.content, userMsg.photo_count || 0);
    const { error } = await supabase
      .from('detailing_ai_conversations')
      .update(patch)
      .eq('id', conversation.id)
      .eq('detailer_id', accountId)
      .eq('user_id', String(userId));
    if (error) return { ok: false, error: error.message };
    return { ok: true, title: patch.title || conversation.title };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
