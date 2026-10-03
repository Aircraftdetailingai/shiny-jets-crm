// Daily cron: re-check linked FAQ pages that have "Keep in sync" on and
// haven't been checked for 7 days, and flag changes for the detailer to
// review (in-app notification). Never edits a saved FAQ list.
import { getServiceSupabase, chatEligible, patchChatSettings } from '@/lib/ai-chat-server';
import { normalizeFaqSources, syncDue, shortUrl } from '@/lib/faq-import';
import { syncSource } from '@/lib/faq-import-server';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 300;
const BUDGET_MS = 240 * 1000;

function authorized(request) {
  const h = request.headers.get('authorization') || '';
  return !!process.env.CRON_SECRET && h === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const started = Date.now();
  const { data: rows, error } = await supabase.from('detailers')
    .select('id, plan, is_admin, notification_settings')
    .not('notification_settings->ai_chat->faq_sources', 'is', null)
    .limit(500);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const stats = { accounts: 0, checked: 0, flagged: 0, errors: 0, skipped: 0 };
  for (const d of rows || []) {
    if (Date.now() - started > BUDGET_MS) break;
    if (!chatEligible(d)) { stats.skipped += 1; continue; }
    const sources = normalizeFaqSources(d.notification_settings?.ai_chat?.faq_sources);
    const due = sources.filter((s) => syncDue(s));
    if (!due.length) continue;
    stats.accounts += 1;
    const results = new Map(); let flagged = 0; const flaggedPages = [];
    for (const s of due) {
      if (Date.now() - started > BUDGET_MS) break;
      const r = await syncSource(s, { accountId: d.id });
      results.set(s.url, r.source); stats.checked += 1;
      if (r.source.last_status === 'error') stats.errors += 1;
      if (r.newItems) { flagged += r.newItems; flaggedPages.push(shortUrl(s.url)); }
    }
    if (!results.size) continue;
    const { error: upErr } = await patchChatSettings(supabase, d.id, (cur) => ({
      faq_sources: normalizeFaqSources(normalizeFaqSources(cur.faq_sources).map((s) => {
        const r = results.get(s.url);
        // keep anything the detailer changed meanwhile (toggle) but take the new check result
        return r ? { ...r, keep_in_sync: s.keep_in_sync, pending: r.pending } : s;
      })),
    }));
    if (upErr) { stats.errors += 1; continue; }
    if (flagged) {
      stats.flagged += flagged;
      await createNotification({
        detailerId: d.id, type: 'faq_sync_changes',
        title: 'Your FAQ page changed: review the updates',
        message: `${flagged} change${flagged === 1 ? '' : 's'} found on ${flaggedPages.join(', ')}. Your chat still uses your saved FAQs until you review them.`,
        link: '/settings/ai-chat#faq-sources',
      }).catch(() => {});
    }
  }
  console.log('[cron/faq-sync]', JSON.stringify(stats));
  return Response.json({ ok: true, ...stats });
}
