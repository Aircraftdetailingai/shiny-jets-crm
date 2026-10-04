// Server-only side of "Ask Brett" (storage, notifications, email). Never import from client code.
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { loadDetailerPlan, isAdminDetailer, ADMIN_EMAILS } from '@/lib/plan-gate';
import { resetPrivateKnowledgeCache } from '@/lib/detailing-ai-knowledge';
import {
  ESCALATION_BUCKET,
  PHOTO_RETENTION_DAYS,
  brettEmail,
  userAnswerEmail,
  buildKnowledgeRow,
  chatLink,
  pollItem,
} from '@/lib/ask-brett';
import crypto from 'crypto';

export const SIGNED_URL_SECONDS = 60 * 60;

export function getServiceSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  // no-store: these reads back a live queue; Next must never cache them.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (u, opts) => fetch(u, { ...opts, cache: 'no-store' }) },
  });
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com').replace(/\/+$/, '');
}

export function accountIdFor(user) {
  return user ? String(user.detailer_id || user.id) : null;
}

/** Admin check for API routes: signed-in user whose detailer row is an admin. */
export async function requireAdmin(user, supabase) {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (ADMIN_EMAILS.includes(String(user.email || '').toLowerCase())) return { ok: true };
  const { detailer } = await loadDetailerPlan(user.id, supabase);
  if (detailer && isAdminDetailer(detailer)) return { ok: true };
  return { ok: false, status: 403, error: 'Admins only' };
}

let bucketChecked = false;
async function ensureBucket(supabase) {
  if (bucketChecked) return;
  try {
    const { data } = await supabase.storage.getBucket(ESCALATION_BUCKET);
    if (!data) await supabase.storage.createBucket(ESCALATION_BUCKET, { public: false, fileSizeLimit: '2MB' });
  } catch { /* the migration creates it; uploads report their own errors */ }
  bucketChecked = true;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Upload validated photos to the private bucket under <account>/<escalation>/. Returns stored paths. */
export async function storeEscalationPhotos(supabase, { detailerId, escalationId, images }) {
  if (!images?.length) return { paths: [], failed: 0 };
  await ensureBucket(supabase);
  const paths = [];
  let failed = 0;
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const path = `${detailerId}/${escalationId}/${i + 1}.${EXT[img.media_type] || 'jpg'}`;
    const { error } = await supabase.storage.from(ESCALATION_BUCKET).upload(path, Buffer.from(img.data, 'base64'), {
      contentType: img.media_type,
      upsert: true,
    });
    if (error) { failed += 1; console.error('[ask-brett] photo upload failed:', error.message); } else paths.push(path);
  }
  return { paths, failed };
}

export async function signedPhotoUrls(supabase, paths) {
  if (!paths?.length) return [];
  const { data, error } = await supabase.storage.from(ESCALATION_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) return [];
  return data.map((d) => d.signedUrl || null).filter(Boolean);
}

async function adminDetailerIds(supabase) {
  const ids = new Set();
  try {
    const { data } = await supabase.from('detailers').select('id').eq('is_admin', true).limit(20);
    (data || []).forEach((r) => ids.add(r.id));
  } catch { /* column may be missing */ }
  try {
    const { data } = await supabase.from('detailers').select('id').in('email', ADMIN_EMAILS).limit(20);
    (data || []).forEach((r) => ids.add(r.id));
  } catch { /* ignore */ }
  return [...ids];
}

/**
 * Optional push for the Chief of Staff: POST JSON to ASK_BRETT_WEBHOOK_URL on every new question.
 * Signed with ASK_BRETT_WEBHOOK_SECRET (header X-Ask-Brett-Signature: sha256=<hex hmac of body>).
 * Never blocks or fails the escalation (3 s timeout).
 */
export async function postWebhook(payload) {
  const url = process.env.ASK_BRETT_WEBHOOK_URL;
  if (!url) return 'off';
  const body = JSON.stringify({ ...payload, sent_at: new Date().toISOString() });
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'ShinyJets-AskBrett/1' };
  if (process.env.ASK_BRETT_WEBHOOK_SECRET) {
    headers['X-Ask-Brett-Signature'] = `sha256=${crypto.createHmac('sha256', process.env.ASK_BRETT_WEBHOOK_SECRET).update(body).digest('hex')}`;
  }
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(3000), cache: 'no-store' });
    return res.ok ? 'sent' : `http_${res.status}`;
  } catch (e) {
    console.error('[ask-brett] webhook failed:', e?.message || e);
    return 'failed';
  }
}

/** Poll auth for the Chief of Staff: Bearer ASK_BRETT_POLL_SECRET (constant-time), or an admin session. */
export function hasPollSecret(request) {
  const secret = process.env.ASK_BRETT_POLL_SECRET;
  if (!secret || secret.length < 16) return false;
  const h = request.headers.get('authorization') || '';
  const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const want = Buffer.from(secret);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

/** Email Brett (with the photos attached) + an in-app notification for every admin account. */
export async function notifyBrett(supabase, { escalation, account, images }) {
  const mail = brettEmail({ escalation, account, appUrl: appUrl() });
  const to = process.env.ASK_BRETT_EMAIL || 'brett@shinyjets.com';
  const attachments = (images || []).map((img, i) => ({
    filename: `photo-${i + 1}.${EXT[img.media_type] || 'jpg'}`,
    content: Buffer.from(img.data, 'base64'),
  }));
  const emailed = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, attachments, replyTo: account?.email || undefined })
    .catch((e) => ({ success: false, error: e?.message }));
  const webhook = await postWebhook({ type: 'ask_brett.created', escalation: pollItem(escalation, account, appUrl()) });
  const admins = await adminDetailerIds(supabase);
  await Promise.all(admins.map((detailerId) => createNotification({
    detailerId,
    type: 'ask_brett',
    title: 'New Ask Brett question',
    message: `${account?.company || account?.email || 'A detailer'}: ${escalation.summary || escalation.question}`.slice(0, 240),
    link: `/admin/ask-brett?id=${escalation.id}`,
    metadata: { escalation_id: escalation.id, reason: escalation.reason },
  }).catch(() => {})));
  return { emailed: !!emailed?.success, admins: admins.length, webhook };
}

/** Email the asker + in-app notification on their account. */
export async function notifyUserAnswered(supabase, { escalation }) {
  let to = escalation.user_email;
  if (!to) {
    const { data } = await supabase.from('detailers').select('email').eq('id', escalation.detailer_id).maybeSingle();
    to = data?.email;
  }
  const mail = userAnswerEmail({ escalation, appUrl: appUrl() });
  const emailed = to
    ? await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text }).catch((e) => ({ success: false, error: e?.message }))
    : { success: false, error: 'no email' };
  await createNotification({
    detailerId: escalation.detailer_id,
    type: 'ask_brett_answer',
    title: 'A Shiny Jets expert answered',
    message: (escalation.summary || escalation.question || '').slice(0, 200),
    link: chatLink('', escalation.conversation_id),
    metadata: { escalation_id: escalation.id, conversation_id: escalation.conversation_id || null },
  }).catch(() => {});
  return { emailed: !!emailed?.success };
}

/** Save the Q&A to the shared private_knowledge table (no account data). */
export async function addAnswerToKnowledge(supabase, escalation) {
  const row = buildKnowledgeRow({
    id: escalation.id,
    summary: escalation.summary,
    question: escalation.question,
    answer: escalation.answer,
    answeredAt: escalation.answered_at || new Date(),
  });
  const { error } = await supabase.from('private_knowledge').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'slug' });
  if (error) return { ok: false, error: error.message };
  resetPrivateKnowledgeCache();
  return { ok: true, slug: row.slug };
}

export { PHOTO_RETENTION_DAYS };
