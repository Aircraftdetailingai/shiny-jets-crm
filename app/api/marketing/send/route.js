import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
  return _resend;
}
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';

function buildCampaignHtml(campaign, detailer, unsubscribeUrl) {
  const BRAND_COLOR = '#1e3a5f';
  const companyName = detailer?.company || detailer?.name || '';
  const headerBgMap = {
    promotional: '#d97706',
    seasonal: '#059669',
    'follow-up': '#2563eb',
    newsletter: BRAND_COLOR,
  };
  const headerBg = headerBgMap[campaign.template_type] || BRAND_COLOR;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${campaign.subject}</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f3f4f6;">
  <div style="background: ${headerBg}; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <div style="margin-bottom: 12px;">
      <span style="color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">&#9992;&#65039; Shiny Jets</span>
    </div>
    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600;">${campaign.subject}</h1>
    ${companyName ? `<p style="color: #cbd5e1; margin: 8px 0 0 0; font-size: 14px;">from ${companyName}</p>` : ''}
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <div style="font-size: 16px; line-height: 1.7; color: #374151;">
      ${campaign.content.replace(/\n/g, '<br>')}
    </div>
    ${detailer?.email || detailer?.phone ? `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Contact ${companyName}:</p>
      <p style="margin: 0;">
        ${detailer?.email ? `<a href="mailto:${detailer.email}" style="color: #1e3a5f; margin: 0 8px;">${detailer.email}</a>` : ''}
        ${detailer?.phone ? `<a href="tel:${detailer.phone}" style="color: #1e3a5f; margin: 0 8px;">${detailer.phone}</a>` : ''}
      </p>
    </div>
    ` : ''}
  </div>
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">Powered by Shiny Jets CRM</p>
    <p style="margin: 8px 0 0 0;"><a href="${unsubscribeUrl}" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a></p>
  </div>
</body></html>`;
}

// POST - Send or schedule a campaign
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { campaign_id } = await request.json();
    if (!campaign_id) return Response.json({ error: 'Campaign ID required' }, { status: 400 });

    // Fetch campaign
    const { data: campaign, error: cErr } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (cErr || !campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });
    if (campaign.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (campaign.status === 'sent') return Response.json({ error: 'Campaign already sent' }, { status: 400 });

    // Fetch detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('name, email, company, phone')
      .eq('id', user.id)
      .single();

    // Get unsubscribed emails
    let unsubscribedEmails = new Set();
    try {
      const { data: unsubs } = await supabase
        .from('marketing_unsubscribes')
        .select('email')
        .eq('detailer_id', user.id);
      if (unsubs) unsubscribedEmails = new Set(unsubs.map(u => u.email?.toLowerCase()));
    } catch {
      // Table might not exist yet
    }

    // Get recipients from quotes based on segment
    let query = supabase
      .from('quotes')
      .select('client_email, client_name')
      .eq('detailer_id', user.id)
      .not('client_email', 'is', null)
      .neq('client_email', '');

    if (campaign.segment === 'paid') {
      query = query.in('status', ['paid', 'completed']);
    } else if (campaign.segment === 'pending') {
      query = query.eq('status', 'sent');
    }

    const { data: quoteRows } = await query;

    // Deduplicate and filter unsubscribed
    const recipientMap = new Map();
    (quoteRows || []).forEach(q => {
      const email = q.client_email?.toLowerCase();
      if (email && !unsubscribedEmails.has(email)) {
        recipientMap.set(email, q.client_name || '');
      }
    });

    // For repeat segment, filter to 2+ quotes
    let recipients;
    if (campaign.segment === 'repeat') {
      const emailCounts = {};
      (quoteRows || []).forEach(q => {
        const email = q.client_email?.toLowerCase();
        if (email) emailCounts[email] = (emailCounts[email] || 0) + 1;
      });
      recipients = [...recipientMap.entries()]
        .filter(([email]) => (emailCounts[email] || 0) >= 2)
        .map(([email, name]) => ({ email, name }));
    } else {
      recipients = [...recipientMap.entries()].map(([email, name]) => ({ email, name }));
    }

    if (recipients.length === 0) {
      return Response.json({ error: 'No recipients found for this segment' }, { status: 400 });
    }

    // Build unsubscribe URL
    const unsubscribeUrl = `${APP_URL}/api/marketing/unsubscribe?token=${campaign.unsubscribe_token || ''}&detailer=${user.id}`;

    // Build email HTML
    const html = buildCampaignHtml(campaign, detailer, unsubscribeUrl);
    const text = campaign.content;

    // Send emails (batch with small delay to avoid rate limits)
    let sentCount = 0;
    const errors = [];

    for (const recipient of recipients) {
      try {
        const { error: sendErr } = await getResend().emails.send({
          from: FROM_EMAIL,
          to: recipient.email,
          subject: campaign.subject,
          html,
          text,
          reply_to: detailer?.email,
        });
        if (sendErr) {
          errors.push(`${recipient.email}: ${sendErr.message || JSON.stringify(sendErr)}`);
        } else {
          sentCount++;
        }
      } catch (e) {
        errors.push(`${recipient.email}: ${e.message}`);
      }
    }

    // Update campaign status
    const updateData = {
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_count: sentCount,
      recipient_count: recipients.length,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from('marketing_campaigns')
      .update(updateData)
      .eq('id', campaign_id);

    return Response.json({
      success: true,
      sent: sentCount,
      total: recipients.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    });
  } catch (err) {
    console.error('Campaign send error:', err);
    return Response.json({ error: 'Failed to send campaign' }, { status: 500 });
  }
}
