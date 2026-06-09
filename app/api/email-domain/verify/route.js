// Ask Resend to re-check the DNS records, stamp custom_email_verified_at
// on success so subsequent sends use the custom From domain immediately.

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('placeholder')) {
    return Response.json({ error: 'Email platform not configured' }, { status: 503 });
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
  if (!detailer.custom_email_resend_domain_id) {
    return Response.json({ error: 'No domain set up yet — call /setup first' }, { status: 400 });
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    // Triggers a re-check on Resend's side (no-op if already verified).
    await resend.domains.verify(detailer.custom_email_resend_domain_id).catch(() => {});
    const got = await resend.domains.get(detailer.custom_email_resend_domain_id);
    const data = got?.data || got;
    const status = data?.status;
    const verified = status === 'verified';

    if (verified) {
      await supabase
        .from('detailers')
        .update({ custom_email_verified_at: new Date().toISOString() })
        .eq('id', user.id);
    }

    return Response.json({
      domain: detailer.custom_email_domain,
      status,
      verified,
      records: data?.records || [],
    });
  } catch (e) {
    console.error('[email-domain/verify] Resend lookup failed:', e?.message);
    return Response.json({ error: e?.message || 'Verify failed' }, { status: 502 });
  }
}
