// Authenticated: the detailer's AI chat settings + FAQ list.
//   GET  -> { plan, eligible, settings: {enabled, handoff_phone, greeting}, faqs, starter, twilio }
//   PUT  -> body { settings?, faqs? }
// Settings live in detailers.notification_settings.ai_chat; FAQs in
// intake_faqs.faqs (same list the existing website widget uses). Scoped to
// the signed-in account only.
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { getServiceSupabase, chatSettingsOf, chatEligible, twilioConfigured } from '@/lib/ai-chat-server';
import { normalizeFaqs, normalizePhone, STARTER_FAQS } from '@/lib/ai-chat';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
const NO_STORE = { 'Cache-Control': 'no-store' };

async function loadOwn(supabase, id) {
  const { data, error } = await supabase.from('detailers')
    .select('id, email, plan, is_admin, phone, notification_settings').eq('id', id).maybeSingle();
  return { detailer: data, error };
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'crew') return Response.json({ error: 'Forbidden' }, { status: 403 });
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const id = await resolveDetailerId(supabase, user);
  const { detailer } = await loadOwn(supabase, id);
  if (!detailer) return Response.json({ error: 'Not found' }, { status: 404 });
  const { data: faqRow } = await supabase.from('intake_faqs').select('faqs, updated_at').eq('detailer_id', id).maybeSingle();
  return Response.json({
    plan: detailer.plan,
    eligible: chatEligible(detailer),
    settings: chatSettingsOf(detailer),
    accountPhone: detailer.phone || '',
    faqs: normalizeFaqs(faqRow?.faqs),
    hasSavedFaqs: !!faqRow,
    starter: STARTER_FAQS,
    twilio: twilioConfigured(),
  }, { headers: NO_STORE });
}

export async function PUT(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role === 'crew') return Response.json({ error: 'Forbidden' }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const id = await resolveDetailerId(supabase, user);
  const { detailer } = await loadOwn(supabase, id);
  if (!detailer) return Response.json({ error: 'Not found' }, { status: 404 });

  if (body.settings) {
    const s = body.settings;
    const current = chatSettingsOf(detailer);
    const next = { ...current };
    if (s.enabled !== undefined) {
      if (s.enabled && !chatEligible(detailer)) return Response.json({ error: 'The AI chat bubble is included with Business ($89.95/mo or $899/yr).', upgrade: '/upgrade?plan=business' }, { status: 403 });
      next.enabled = !!s.enabled;
    }
    if (s.handoff_phone !== undefined) {
      const raw = String(s.handoff_phone || '').trim();
      if (raw && !normalizePhone(raw)) return Response.json({ error: 'Enter a valid mobile number for chat handoffs, for example 555 123 4567.', field: 'handoff_phone' }, { status: 400 });
      next.handoff_phone = raw ? normalizePhone(raw) : '';
    }
    if (s.greeting !== undefined) next.greeting = String(s.greeting || '').trim().slice(0, 300);
    const ns = { ...(detailer.notification_settings || {}), ai_chat: next };
    const { error } = await supabase.from('detailers').update({ notification_settings: ns }).eq('id', id);
    if (error) return Response.json({ error: 'Could not save settings.' }, { status: 500 });
  }

  if (body.faqs !== undefined) {
    const faqs = normalizeFaqs(body.faqs);
    const { error } = await supabase.from('intake_faqs')
      .upsert({ detailer_id: id, faqs, updated_at: new Date().toISOString() }, { onConflict: 'detailer_id' });
    if (error) return Response.json({ error: 'Could not save FAQs.' }, { status: 500 });
  }
  return GET(request);
}
