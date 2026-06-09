// Enterprise-only custom email sending domain — wraps Resend Domains API.
//
//   POST   /api/email-domain/setup    create + return DNS records
//   POST   /api/email-domain/verify   ask Resend to recheck DNS, stamp verified_at on success
//   DELETE /api/email-domain          remove the domain (Resend + DB)
//
// Plan gating + ownership checks live here, not in the UI. The /settings/
// developer page surfaces this for plan='enterprise' only.

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

async function loadDetailer(supabase, id) {
  const { data } = await supabase
    .from('detailers')
    .select('id, email, plan, custom_email_domain, custom_email_verified_at, custom_email_resend_domain_id')
    .eq('id', id)
    .single();
  return data;
}

function isEnterprise(detailer) {
  return (detailer?.plan || '').toLowerCase() === 'enterprise';
}

function noRsendKey() {
  return !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('placeholder');
}

// GET — read current domain state
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabase();
  const detailer = await loadDetailer(supabase, user.id);
  if (!detailer) return Response.json({ error: 'Detailer not found' }, { status: 404 });
  return Response.json({
    plan: detailer.plan,
    isEnterprise: isEnterprise(detailer),
    domain: detailer.custom_email_domain,
    verifiedAt: detailer.custom_email_verified_at,
    resendDomainId: detailer.custom_email_resend_domain_id,
  });
}

// DELETE — remove the domain (clears columns + best-effort Resend delete)
export async function DELETE(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabase();
  const detailer = await loadDetailer(supabase, user.id);
  if (!detailer) return Response.json({ error: 'Detailer not found' }, { status: 404 });

  if (detailer.custom_email_resend_domain_id && !noRsendKey()) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.domains.remove(detailer.custom_email_resend_domain_id);
    } catch (e) {
      console.warn('[email-domain] Resend delete failed (continuing):', e?.message);
    }
  }

  await supabase
    .from('detailers')
    .update({
      custom_email_domain: null,
      custom_email_verified_at: null,
      custom_email_resend_domain_id: null,
    })
    .eq('id', user.id);

  return Response.json({ success: true });
}
