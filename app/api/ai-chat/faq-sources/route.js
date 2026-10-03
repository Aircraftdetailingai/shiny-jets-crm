// Linked FAQ pages ("Keep in sync"). Authenticated, scoped to the signed-in
// account. POST { action, url, ... }:
//   toggle  { keep_in_sync }        turn weekly checks on/off (on = Business)
//   check                           re-check the page now (Business)
//   resolve { keys: [...] }         drop reviewed change flags
//   dismiss                         drop all change flags for the page
//   remove                          unlink the page (saved FAQs stay)
// Change flags never edit the FAQ list; the detailer applies them in the UI.
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { getServiceSupabase, chatEligible, patchChatSettings } from '@/lib/ai-chat-server';
import { createRateLimiter } from '@/lib/ai-chat';
import { normalizeFaqSources, publicSources, normalizeImportUrl } from '@/lib/faq-import';
import { syncSource } from '@/lib/faq-import-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

const checks = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'crew') return Response.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const id = await resolveDetailerId(supabase, user);
  const { data: detailer } = await supabase.from('detailers').select('id, plan, is_admin, notification_settings').eq('id', id).maybeSingle();
  if (!detailer) return Response.json({ error: 'Not found' }, { status: 404 });

  const url = normalizeImportUrl(body?.url);
  const action = String(body?.action || '');
  const sources = normalizeFaqSources(detailer.notification_settings?.ai_chat?.faq_sources);
  const idx = sources.findIndex((s) => s.url === url);
  if (idx < 0) return Response.json({ error: 'That page isn’t linked to your FAQs.' }, { status: 404 });
  const needsBusiness = action === 'check' || (action === 'toggle' && body.keep_in_sync === true);
  if (needsBusiness && !chatEligible(detailer)) return Response.json({ error: 'Keeping FAQs in sync with your website is included with Business.', upgrade: '/upgrade?plan=business' }, { status: 403 });

  let updated = null; let newItems = 0;
  if (action === 'toggle') updated = { ...sources[idx], keep_in_sync: body.keep_in_sync === true };
  else if (action === 'resolve') {
    const keys = new Set((Array.isArray(body.keys) ? body.keys : []).map(String));
    updated = { ...sources[idx], pending: sources[idx].pending.filter((p) => !keys.has(p.key)) };
  } else if (action === 'dismiss') updated = { ...sources[idx], pending: [] };
  else if (action === 'check') {
    const rl = checks.check(id);
    if (!rl.ok) return Response.json({ error: 'Too many checks. Try again in a few minutes.' }, { status: 429 });
    const r = await syncSource(sources[idx], { accountId: id });
    updated = r.source; newItems = r.newItems;
  } else if (action !== 'remove') return Response.json({ error: 'Unknown action' }, { status: 400 });

  const { error, settings } = await patchChatSettings(supabase, id, (cur) => {
    const list = normalizeFaqSources(cur.faq_sources);
    const j = list.findIndex((s) => s.url === url);
    if (action === 'remove') return { faq_sources: list.filter((s) => s.url !== url) };
    if (j >= 0) list[j] = updated;
    return { faq_sources: normalizeFaqSources(list) };
  });
  if (error) return Response.json({ error: 'Could not save. Try again.' }, { status: 500 });
  return Response.json({ sources: publicSources(settings.faq_sources), newItems }, { headers: { 'Cache-Control': 'no-store' } });
}
