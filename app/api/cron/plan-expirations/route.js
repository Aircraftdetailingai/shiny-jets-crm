import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { loadUnsubscribedEmails, isUnsubscribed } from '@/lib/email-suppression';

export const dynamic = 'force-dynamic';

// Course-bundle buyers get exactly one included year of Pro; the grant path
// stamps plan_expires_at = now + 1yr. This daily cron downgrades those whose
// year has elapsed and sends one courtesy email pointing at the Pro checkout.
const PRO_CHECKOUT_URL = 'https://shinyjets.com/products/aircraft-detailing-crm-pro';

function verifySecret(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return token === process.env.CRON_SECRET;
}

export async function POST(request) {
  if (!verifySecret(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
  const nowISO = new Date().toISOString();

  // Load the opt-out list once. Fail closed: if we can't verify it, do nothing
  // this run rather than risk emailing someone who opted out. Retried tomorrow.
  let unsubscribed;
  try {
    unsubscribed = await loadUnsubscribedEmails(supabase);
  } catch (e) {
    console.error('[cron/plan-expirations]', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }

  // Expired dated entitlements only. The `.not('plan_expires_at', 'is', null)`
  // null-guard is load-bearing: rows with a null plan_expires_at are paying and
  // comped accounts and must NEVER be touched by this cron.
  const { data: expired, error } = await supabase
    .from('detailers')
    .select('id, email, name, plan, plan_expires_at')
    .not('plan_expires_at', 'is', null)
    .lt('plan_expires_at', nowISO)
    .neq('plan', 'free');

  if (error) {
    console.error('[cron/plan-expirations] query error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let downgraded = 0;
  let skippedUnsubscribed = 0;

  for (const d of expired || []) {
    // Flip the plan FIRST. This is the re-email guard: once plan='free' the row
    // no longer matches the query above, so a later run can never email again.
    const { error: updErr } = await supabase
      .from('detailers')
      .update({ plan: 'free', subscription_status: 'expired' })
      .eq('id', d.id);
    if (updErr) {
      console.error('[cron/plan-expirations] downgrade failed for', d.id, updErr.message);
      continue;
    }
    downgraded++;

    if (!d.email) continue;
    // Honor the suppression list — skip the courtesy email but keep the downgrade.
    if (isUnsubscribed(unsubscribed, d.email)) {
      skippedUnsubscribed++;
      continue;
    }

    const firstName = (d.name || '').split(' ')[0] || 'there';
    const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#f9f9f9;">
  <div style="background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
    <h2 style="color:#007CB1;margin:0 0 16px;font-size:22px;">Hi ${firstName},</h2>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">Your included year of Shiny Jets CRM Pro has ended, so your account has moved to the Free plan. Your data is safe and still here — you just won't have Pro features until you resubscribe.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">To keep sending professional quotes and invoices, take payments, and use everything Pro offers, you can continue for another year below.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${PRO_CHECKOUT_URL}" style="display:inline-block;padding:14px 28px;background:#007CB1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Continue with Pro</a>
    </div>
    <p style="font-size:13px;color:#666;line-height:1.6;margin:24px 0 0;">Questions? Just reply to this email and we'll help.</p>
  </div>
</body></html>`;
    const text = `Hi ${firstName},

Your included year of Shiny Jets CRM Pro has ended, so your account has moved to the Free plan. Your data is safe and still here.

To continue with Pro for another year: ${PRO_CHECKOUT_URL}

Questions? Just reply to this email and we'll help.`;

    // Shared lib/email path so the CAN-SPAM footer + List-Unsubscribe headers apply.
    await sendEmail({
      to: d.email,
      subject: 'Your included year of Shiny Jets CRM has ended',
      html,
      text,
    }).catch((err) =>
      console.error('[cron/plan-expirations] email failed for', d.email, err.message)
    );
  }

  return Response.json({
    downgraded,
    skipped_unsubscribed: skippedUnsubscribed,
    timestamp: nowISO,
  });
}

// Vercel Cron sends GET requests; expose the same handler for GET.
export const GET = POST;
