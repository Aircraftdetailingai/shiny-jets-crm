// Public: "Have someone text you" from the AI chat bubble. Saves an AI Lead
// (intake_leads, source = 'ai_chat', full transcript) for THIS account and
// notifies the detailer right away: in-app notification + email always, and
// a text message too once Twilio is configured (TWILIO_* env vars).
import { getServiceSupabase, loadChatAccount, chatSettingsOf, chatEligible, twilioConfigured, appBaseUrl } from '@/lib/ai-chat-server';
import { validateHandoff, sanitizeTranscript, createRateLimiter, clientIp, cleanPageUrl, SMS_CONSENT_TEXT } from '@/lib/ai-chat';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { sendSms } from '@/lib/sms';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const perIp = createRateLimiter({ limit: 3, windowMs: 60 * 60 * 1000 });
const perAccount = createRateLimiter({ limit: 30, windowMs: 24 * 60 * 60 * 1000 });
const DAILY_DB_CAP = 100;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const supabase = getServiceSupabase();
  const detailer = await loadChatAccount(supabase, body?.account);
  if (!detailer) return Response.json({ error: 'Not found' }, { status: 404 });
  const settings = chatSettingsOf(detailer);
  if (!chatEligible(detailer) || !settings.enabled) return Response.json({ error: 'Chat is not available for this business.' }, { status: 403 });

  const { ok, errors, value } = validateHandoff(body);
  if (!ok) return Response.json({ error: 'Please fix the highlighted fields.', fields: errors }, { status: 400 });

  const ip = clientIp(request);
  const a = perAccount.check(detailer.id);
  const b = perIp.check(`${detailer.id}:${ip}`);
  if (!a.ok || !b.ok) return Response.json({ error: 'We already have your request. Please wait a little before sending another.' }, { status: 429 });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: recent } = await supabase.from('intake_leads').select('id, phone, created_at')
    .eq('detailer_id', detailer.id).eq('source', 'ai_chat').gte('created_at', since).limit(DAILY_DB_CAP + 1);
  if ((recent || []).length >= DAILY_DB_CAP) return Response.json({ error: 'Please try again later.' }, { status: 429 });
  const dupe = (recent || []).find((r) => r.phone === value.phone && Date.now() - new Date(r.created_at).getTime() < 10 * 60 * 1000);
  if (dupe) return Response.json({ success: true, deduped: true });

  const company = detailer.company || detailer.name || '';
  const now = new Date().toISOString();
  const transcript = sanitizeTranscript(body?.transcript);
  const pageUrl = cleanPageUrl(body?.pageUrl);
  const row = {
    detailer_id: detailer.id,
    name: value.name,
    phone: value.phone,
    email: null,
    notes: value.question,
    sms_opted_in: true,
    source: 'ai_chat',
    status: 'new',
    intake_responses: {
      _ai_chat: {
        question: value.question,
        page_url: pageUrl,
        transcript,
        sms_consent: true,
        consent_text: SMS_CONSENT_TEXT(company),
        consent_at: now,
      },
    },
  };

  let leadId = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase.from('intake_leads').insert(row).select('id').single();
    if (!error) { leadId = data.id; break; }
    const col = error.message?.match(/column "?([a-z_]+)"? .*does not exist|Could not find the '([a-z_]+)' column/i);
    const name = col && (col[1] || col[2]);
    if (name && name in row && !['detailer_id', 'source', 'intake_responses'].includes(name)) { delete row[name]; continue; }
    console.error('[ai-chat/handoff] insert failed:', error.message);
    return Response.json({ error: 'Could not send your request. Please try again or use Request a quote.' }, { status: 500 });
  }

  const link = `${appBaseUrl(request)}/ai-leads?id=${leadId}`;
  const notified = { inApp: false, email: false, sms: false, smsConfigured: twilioConfigured() };

  try {
    await createNotification({
      detailerId: detailer.id,
      type: 'ai_chat_handoff',
      title: 'New AI chat lead: text them back',
      message: `${value.name} (${value.phone}) asked: ${value.question.slice(0, 140)}`,
      link: `/ai-leads?id=${leadId}`,
      metadata: { lead_id: leadId, source: 'ai_chat' },
    });
    notified.inApp = true;
  } catch (e) { console.error('[ai-chat/handoff] in-app notify failed:', e?.message); }

  if (detailer.email) {
    const r = await sendEmail({
      to: detailer.email,
      subject: `New AI chat lead: ${value.name} wants a text back`,
      preheader: value.question.slice(0, 90),
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#111827">
        <h2 style="margin:0 0 8px">Someone wants a text back</h2>
        <p style="margin:0 0 16px">A visitor asked your website chat a question it couldn't answer from your FAQs.</p>
        <p style="margin:4px 0"><strong>Name:</strong> ${esc(value.name)}</p>
        <p style="margin:4px 0"><strong>Mobile:</strong> <a href="sms:${esc(value.phone)}">${esc(value.phone)}</a> (agreed to texts)</p>
        <p style="margin:4px 0"><strong>Question:</strong> ${esc(value.question)}</p>
        ${pageUrl ? `<p style="margin:4px 0"><strong>Page:</strong> ${esc(pageUrl)}</p>` : ''}
        <p style="margin:20px 0"><a href="${esc(link)}" style="display:inline-block;background:#007CB1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600">Open in AI Leads</a></p>
      </div>`,
      text: `Someone wants a text back.\nName: ${value.name}\nMobile: ${value.phone}\nQuestion: ${value.question}\n${pageUrl ? `Page: ${pageUrl}\n` : ''}Open: ${link}`,
    }).catch((e) => ({ success: false, error: e?.message }));
    notified.email = !!r?.success;
  }

  const smsTo = settings.handoff_phone || detailer.phone;
  if (notified.smsConfigured && smsTo) {
    const r = await sendSms({ to: smsTo, body: `New chat lead: ${value.name} ${value.phone} asked "${value.question.slice(0, 120)}". Text them back. ${link}` })
      .catch((e) => ({ success: false, error: e?.message }));
    notified.sms = !!r?.success;
  }
  console.log('[ai-chat/handoff]', JSON.stringify({ account: detailer.id, lead: leadId, ...notified }));

  return Response.json({ success: true });
}
