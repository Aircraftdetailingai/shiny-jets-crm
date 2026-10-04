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
const LIST_FIELDS = 'id, title, created_at, updated_at';

export async function listConversations(supabase, { accountId, userId }) {
  const { data, error } = await supabase
    .from('detailing_ai_conversations')
    .select(LIST_FIELDS)
    .eq('detailer_id', accountId)
    .eq('user_id', String(userId))
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT);
  return { data: data || [], error };
}

export async function getOwnedConversation(supabase, { id, accountId, userId }, fields = 'id, title, messages, created_at, updated_at') {
  if (!isUuid(id)) return null;
  const { data } = await supabase
    .from('detailing_ai_conversations')
    .select(fields)
    .eq('id', id)
    .eq('detailer_id', accountId)
    .eq('user_id', String(userId))
    .maybeSingle();
  return data || null;
}

export async function createConversation(supabase, { accountId, userId, title = null }) {
  const { data, error } = await supabase
    .from('detailing_ai_conversations')
    .insert({ detailer_id: accountId, user_id: String(userId), title: title ? cleanTitle(title) : null, messages: [] })
    .select('id, title, messages, created_at, updated_at')
    .single();
  return { data, error };
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
