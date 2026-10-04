// Server side of the Aircraft Detailing AI Terms gate. Table: public.detailing_ai_terms_acceptances
// (supabase/migrations/20261008_detailing_ai_terms_acceptances.sql). Service role only.
import { TERMS_VERSION } from './detailing-ai-terms.js';

export const TERMS_TABLE = 'detailing_ai_terms_acceptances';

export function termsUserId(user) {
  return user?.id != null ? String(user.id) : null;
}
export function termsAccountId(user) {
  return user ? String(user.detailer_id || user.id) : null;
}

/** { ok: true, accepted, accepted_at } or { ok: false } when the table can't be read. */
export async function getTermsStatus(supabase, user, version = TERMS_VERSION) {
  const userId = termsUserId(user);
  if (!supabase || !userId) return { ok: false };
  const { data, error } = await supabase
    .from(TERMS_TABLE)
    .select('accepted_at')
    .eq('user_id', userId)
    .eq('terms_version', version)
    .order('accepted_at', { ascending: false })
    .limit(1);
  if (error) return { ok: false, error };
  const row = Array.isArray(data) ? data[0] : null;
  return { ok: true, accepted: Boolean(row), accepted_at: row?.accepted_at || null };
}

/** Records acceptance of the CURRENT version for this user + account. Idempotent. */
export async function recordTermsAcceptance(supabase, user, { userAgent, ip } = {}) {
  const userId = termsUserId(user);
  if (!supabase || !userId) return { ok: false };
  const row = {
    user_id: userId,
    detailer_id: termsAccountId(user),
    user_email: user.email ? String(user.email).slice(0, 320) : null,
    terms_version: TERMS_VERSION,
    accepted_at: new Date().toISOString(),
    user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
    ip: ip ? String(ip).slice(0, 100) : null,
  };
  const { error } = await supabase
    .from(TERMS_TABLE)
    .upsert(row, { onConflict: 'user_id,terms_version', ignoreDuplicates: true });
  if (error) return { ok: false, error };
  return getTermsStatus(supabase, user);
}

export const TERMS_REQUIRED_CODE = 'TERMS_REQUIRED';

/**
 * Chat gate: null when the user accepted the current version, otherwise a Response.
 * Fails closed: if acceptance can't be confirmed, the chat stays blocked.
 */
export async function requireTermsAccepted(supabase, user) {
  const status = await getTermsStatus(supabase, user);
  if (status.ok && status.accepted) return null;
  if (!status.ok) {
    return Response.json(
      { error: 'We couldn\u2019t confirm your agreement to the Aircraft Detailing AI Terms. Reload the page and try again.', code: TERMS_REQUIRED_CODE, terms_version: TERMS_VERSION },
      { status: 503 },
    );
  }
  return Response.json(
    { error: 'Please agree to the Aircraft Detailing AI Terms to use Detailing AI.', code: TERMS_REQUIRED_CODE, terms_version: TERMS_VERSION },
    { status: 403 },
  );
}
