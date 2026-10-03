// Server-side helpers for the AI chat bubble (service-role Supabase).
// Every query here is scoped to ONE detailer id (the account the widget was
// installed for). Never select across accounts.
import { createClient } from '@supabase/supabase-js';
import { hasFeature } from './plans';
import { isAdminDetailer } from './plan-gate';
import { normalizeFaqs, AI_CHAT_FEATURE } from './ai-chat';

export function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  // no-store: Next's Data Cache would otherwise serve stale rows (see
  // app/api/lead-intake/leads/route.js).
  return createClient(url, key, { global: { fetch: (u, opts) => fetch(u, { ...opts, cache: 'no-store' }) } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/i;
const COLS = 'id, slug, company, name, email, phone, plan, is_admin, theme_primary, theme_logo_url, logo_url, notification_settings';

// Resolve the account a widget belongs to by exact slug or id (no fuzzy
// company-name matching, so one shop can never be confused with another).
export async function loadChatAccount(supabase, identifier) {
  const id = String(identifier || '').trim();
  if (!supabase || !id) return null;
  let q = supabase.from('detailers').select(COLS);
  if (UUID_RE.test(id)) q = q.eq('id', id);
  else if (SLUG_RE.test(id)) q = q.eq('slug', id);
  else return null;
  const { data, error } = await q.maybeSingle();
  if (error) { console.error('[ai-chat] account lookup failed:', error.message); return null; }
  return data || null;
}

export function chatSettingsOf(detailer) {
  const s = detailer?.notification_settings?.ai_chat || {};
  return {
    enabled: s.enabled === true,
    handoff_phone: typeof s.handoff_phone === 'string' ? s.handoff_phone : '',
    greeting: typeof s.greeting === 'string' ? s.greeting.slice(0, 300) : '',
  };
}

// Everything stored under notification_settings.ai_chat (settings + linked
// FAQ pages). Writers must merge into this so no key is dropped.
export function rawChatSettings(detailer) {
  const s = detailer?.notification_settings?.ai_chat;
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
}

// Re-read the account row and merge `patch` into ai_chat (scoped to one id).
export async function patchChatSettings(supabase, detailerId, patchFn) {
  const { data: fresh, error } = await supabase.from('detailers').select('id, notification_settings').eq('id', detailerId).maybeSingle();
  if (error || !fresh) return { error: error || new Error('not found') };
  const cur = rawChatSettings(fresh);
  const next = { ...cur, ...patchFn(cur) };
  const ns = { ...(fresh.notification_settings || {}), ai_chat: next };
  const { error: upErr } = await supabase.from('detailers').update({ notification_settings: ns }).eq('id', detailerId);
  return { error: upErr, settings: next };
}

export function chatEligible(detailer) {
  return !!detailer && hasFeature(detailer, AI_CHAT_FEATURE, { isAdmin: isAdminDetailer(detailer) });
}

// The shop's own FAQ list — the ONLY knowledge the chat may use.
export async function loadAccountFaqs(supabase, detailerId) {
  if (!supabase || !detailerId) return [];
  const { data, error } = await supabase.from('intake_faqs').select('faqs').eq('detailer_id', detailerId).maybeSingle();
  if (error) { console.error('[ai-chat] faq lookup failed:', error.message); return []; }
  return normalizeFaqs(data?.faqs);
}

export function twilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER));
}

// Base URL for links we hand out (quote form, AI Leads link in emails):
// the host this request came in on, e.g. https://crm.shinyjets.com.
export function appBaseUrl(request) {
  try {
    if (request?.url) {
      const u = new URL(request.url);
      const host = request.headers?.get?.('x-forwarded-host') || u.host;
      const proto = request.headers?.get?.('x-forwarded-proto') || u.protocol.replace(':', '');
      const name = host.split(':')[0].toLowerCase();
      const trusted = name === 'localhost' || name === '127.0.0.1' || name === 'shinyjets.com' || name.endsWith('.shinyjets.com') || name.endsWith('.vercel.app');
      if (trusted && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) return `${proto === 'http' ? 'http' : 'https'}://${host}`;
    }
  } catch {}
  return 'https://crm.shinyjets.com';
}
