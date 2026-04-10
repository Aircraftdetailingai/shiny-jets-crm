import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>';
const APP_URL = 'https://crm.shinyjets.com';

export async function POST(request) {
  return handle(request);
}

export async function GET(request) {
  return handle(request);
}

async function handle(request) {
  // Verify CRON_SECRET from Authorization header
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );

  // Find detailers who signed up >24h ago but haven't completed onboarding
  // and haven't been sent a nudge yet
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: detailers, error } = await supabase
    .from('detailers')
    .select('id, email, name, company, plan, created_at, onboarding_complete, onboarding_completed, onboarding_nudge_sent_at')
    .or('onboarding_complete.eq.false,onboarding_complete.is.null')
    .lt('created_at', cutoff)
    .is('onboarding_nudge_sent_at', null)
    .limit(50);

  if (error) {
    console.error('[onboarding-nudge] Query error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!detailers || detailers.length === 0) {
    return Response.json({ processed: 0 });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  let sent = 0;
  let failed = 0;

  for (const detailer of detailers) {
    // Skip if already onboarded (double check via either column)
    if (detailer.onboarding_complete === true || detailer.onboarding_completed === true) continue;
    if (!detailer.email) continue;

    const firstName = (detailer.name || '').split(' ')[0] || 'there';

    const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#f9f9f9;">
  <div style="background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
    <h2 style="color:#007CB1;margin:0 0 16px;font-size:22px;">Hi ${firstName},</h2>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">You signed up for Shiny Jets CRM but haven't finished setting things up yet. It only takes about 5 minutes to start sending professional quotes.</p>

    <div style="background:#f0f7fb;border-left:3px solid #007CB1;padding:16px 20px;margin:24px 0;border-radius:4px;">
      <p style="margin:0 0 12px;font-weight:600;color:#007CB1;">Finish these 3 steps to go live:</p>
      <ol style="margin:0;padding-left:20px;line-height:1.8;font-size:14px;">
        <li>Add your services and hourly rate</li>
        <li>Connect Stripe to accept payments</li>
        <li>Send your first quote</li>
      </ol>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="${APP_URL}/onboarding" style="display:inline-block;padding:14px 28px;background:#007CB1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Complete Setup</a>
    </div>

    <p style="font-size:13px;color:#666;line-height:1.6;margin:24px 0 0;">Need help getting started? Just reply to this email and we'll walk you through it.</p>

    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
    <p style="font-size:11px;color:#999;margin:0;text-align:center;">Shiny Jets CRM &middot; <a href="${APP_URL}" style="color:#999;">crm.shinyjets.com</a></p>
  </div>
</body></html>`;

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: detailer.email,
        subject: `${firstName}, finish setting up Shiny Jets CRM`,
        html,
      });

      // Mark as nudged (column-stripping retry in case column doesn't exist)
      const { error: updErr } = await supabase
        .from('detailers')
        .update({ onboarding_nudge_sent_at: new Date().toISOString() })
        .eq('id', detailer.id);

      if (updErr && updErr.message?.includes('onboarding_nudge_sent_at')) {
        console.log('[onboarding-nudge] Column missing, skipping mark');
      }

      sent++;
      console.log('[onboarding-nudge] Sent to:', detailer.email);
    } catch (err) {
      failed++;
      console.error('[onboarding-nudge] Failed for', detailer.email, err.message);
    }
  }

  return Response.json({ sent, failed, total: detailers.length });
}
