import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: user });
  if (planGate) return planGate;

  const { id: jobId } = await params;
  const body = await request.json();
  const { send_email, customer_email } = body;

  const supabase = getSupabase();

  // Verify job belongs to owner
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, detailer_id, customer_name, aircraft_model, tail_number, delivery_link, status')
    .eq('id', jobId)
    .eq('detailer_id', user.detailer_id || user.id)
    .single();

  if (jobErr || !job) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Generate or reuse share link
  let shareLink = job.delivery_link;
  if (!shareLink) {
    shareLink = crypto.randomBytes(12).toString('hex');
    const { error: updateErr } = await supabase
      .from('jobs')
      .update({ delivery_link: shareLink })
      .eq('id', jobId);

    if (updateErr) {
      console.error('Update delivery_link error:', updateErr);
      return Response.json({ error: 'Failed to generate delivery link' }, { status: 500 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
  const deliveryUrl = `${appUrl}/delivery/${shareLink}`;

  // Send email if requested
  if (send_email && customer_email) {
    const { data: detailer } = await supabase
      .from('detailers')
      .select('company, name, email, logo_url, theme_primary')
      .eq('id', user.id)
      .single();

    const companyName = detailer?.company || detailer?.name || 'Your detailer';
    const aircraft = job.aircraft_model || 'your aircraft';
    const tailDisplay = job.tail_number ? ` (${job.tail_number})` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#0A0E17;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    ${detailer?.logo_url ? `<div style="text-align:center;margin-bottom:24px;"><img src="${detailer.logo_url}" alt="${companyName}" style="max-height:60px;max-width:200px;" /></div>` : ''}
    <div style="background:#111827;border:1px solid #1A2236;border-radius:8px;padding:40px 32px;text-align:center;">
      <div style="width:48px;height:1px;background:${detailer?.theme_primary || '#C9A84C'};margin:0 auto 24px;"></div>
      <p style="color:#8A9BB0;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 16px;">Delivery Report</p>
      <h1 style="color:#F5F5F5;font-size:24px;font-weight:300;margin:0 0 8px;">Your Aircraft Detail is Complete</h1>
      <p style="color:#8A9BB0;font-size:15px;margin:0 0 32px;">${aircraft}${tailDisplay}</p>
      <a href="${deliveryUrl}" style="display:inline-block;background:${detailer?.theme_primary || '#C9A84C'};color:#0A0E17;text-decoration:none;padding:14px 40px;border-radius:4px;font-weight:600;font-size:15px;letter-spacing:0.02em;">View Delivery Report</a>
      <p style="color:#4A5568;font-size:13px;margin:32px 0 0;">Thank you for choosing ${companyName}.</p>
    </div>
    <p style="text-align:center;color:#4A5568;font-size:11px;margin-top:24px;">Powered by Shiny Jets CRM</p>
  </div>
</body></html>`;

    const text = `Your Aircraft Detail is Complete\n\n${aircraft}${tailDisplay}\n\nView your delivery report: ${deliveryUrl}\n\nThank you for choosing ${companyName}.`;

    const fromAddr = detailer?.company
      ? `${detailer.company} <noreply@mail.shinyjets.com>`
      : 'Shiny Jets CRM <noreply@mail.shinyjets.com>';

    await sendEmail({
      to: customer_email,
      subject: 'Your Aircraft Detail is Complete',
      html,
      text,
      replyTo: detailer?.email,
      from: fromAddr,
    });
  }

  return Response.json({ share_link: shareLink, url: deliveryUrl });
}
