// Create the sending domain in Resend and persist the returned records so
// the UI can show them to the detailer. Enterprise-gated.

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('placeholder')) {
    return Response.json({ error: 'Email platform not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const raw = String(body?.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!DOMAIN_RE.test(raw)) {
    return Response.json({ error: 'Invalid domain. Example: yourcompany.com' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, plan, custom_email_domain, custom_email_resend_domain_id')
    .eq('id', user.id)
    .single();
  if (!detailer) return Response.json({ error: 'Detailer not found' }, { status: 404 });
  const plan = (detailer.plan || '').toLowerCase();
  if (plan !== 'business' && plan !== 'enterprise') {
    return Response.json({ error: 'Custom email domain is available on the Business and Enterprise plans' }, { status: 403 });
  }

  // Reuse existing record if the detailer is re-setting up the same domain
  if (detailer.custom_email_domain === raw && detailer.custom_email_resend_domain_id) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const existing = await resend.domains.get(detailer.custom_email_resend_domain_id);
      const data = existing?.data || existing;
      return Response.json({
        domain: raw,
        resendDomainId: data?.id || detailer.custom_email_resend_domain_id,
        status: data?.status,
        records: data?.records || [],
      });
    } catch (e) {
      // fall through to a fresh create if Resend forgot about it
      console.warn('[email-domain/setup] existing lookup failed, recreating:', e?.message);
    }
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const created = await resend.domains.create({ name: raw });
    const data = created?.data || created;
    if (!data?.id) {
      const errMsg = created?.error?.message || 'Resend did not return a domain id';
      return Response.json({ error: errMsg }, { status: 502 });
    }

    await supabase
      .from('detailers')
      .update({
        custom_email_domain: raw,
        custom_email_resend_domain_id: data.id,
        custom_email_verified_at: null,
      })
      .eq('id', user.id);

    return Response.json({
      domain: raw,
      resendDomainId: data.id,
      status: data.status,
      records: data.records || [],
    });
  } catch (e) {
    console.error('[email-domain/setup] Resend create failed:', e?.message);
    return Response.json({ error: e?.message || 'Resend create failed' }, { status: 502 });
  }
}
