import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>';
const APP_URL = 'https://crm.shinyjets.com';
const DIRECTORY_URL = 'https://directory.shinyjets.com';

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

  // Find detailers signed up >5 days ago who haven't listed in the directory
  // and haven't been invited yet
  const cutoff = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  // First try with directory_invite_sent_at filter (column may not exist yet)
  let detailers = null;
  let queryError = null;
  try {
    const result = await supabase
      .from('detailers')
      .select('id, email, name, company, plan, created_at, listed_in_directory, directory_invite_sent_at')
      .or('listed_in_directory.eq.false,listed_in_directory.is.null')
      .eq('status', 'active')
      .lt('created_at', cutoff)
      .is('directory_invite_sent_at', null)
      .limit(50);
    detailers = result.data;
    queryError = result.error;
  } catch (e) {
    queryError = { message: e.message };
  }

  // Fallback: column doesn't exist yet — query without that filter
  if (queryError && queryError.message?.includes('directory_invite_sent_at')) {
    console.log('[directory-invite] directory_invite_sent_at column missing, querying without filter');
    const result = await supabase
      .from('detailers')
      .select('id, email, name, company, plan, created_at, listed_in_directory')
      .or('listed_in_directory.eq.false,listed_in_directory.is.null')
      .eq('status', 'active')
      .lt('created_at', cutoff)
      .limit(50);
    detailers = result.data;
    queryError = result.error;
  }

  if (queryError) {
    console.error('[directory-invite] Query error:', queryError.message);
    return Response.json({ error: queryError.message }, { status: 500 });
  }

  if (!detailers || detailers.length === 0) {
    return Response.json({ processed: 0, sent: 0 });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
  }

  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const detailer of detailers) {
    if (!detailer.email) { skipped++; continue; }
    if (detailer.listed_in_directory === true) { skipped++; continue; }

    const firstName = (detailer.name || '').split(' ')[0] || 'there';
    const company = detailer.company || 'your business';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="background:linear-gradient(135deg,#0D1B2A 0%,#1a3050 100%);padding:32px 28px;border-radius:12px 12px 0 0;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">The Shiny Jets Directory is live</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px;">A new way for aircraft owners to find you</p>
  </div>

  <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;color:#1a2236;margin:0 0 16px;">Hi ${firstName},</p>

    <p style="font-size:15px;color:#4a5568;margin:0 0 18px;line-height:1.6;">
      I just launched <strong><a href="${DIRECTORY_URL}" style="color:#007CB1;text-decoration:none;">directory.shinyjets.com</a></strong> &mdash; an interactive globe where aircraft owners can find certified detailers near their home airport. ${company} is not listed yet, and I wanted to make sure you don't miss out.
    </p>

    <p style="font-size:15px;color:#4a5568;margin:0 0 24px;line-height:1.6;">
      Owners are already searching for detailers near KTEB, KLAS, KCNO, KSFO, and dozens more airports. When they find you, they can request a quote with one click &mdash; straight into your CRM inbox.
    </p>

    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:0 0 24px;">
      <p style="margin:0 0 12px;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Your listing will show:</p>
      <ul style="margin:0;padding:0 0 0 18px;color:#374151;font-size:14px;line-height:1.8;">
        <li>A blue pin at your home airport on the world map</li>
        <li>Your business name and logo</li>
        <li>Services you offer</li>
        <li>"Online Booking" badge if you accept Stripe payments</li>
        <li>"Request a Quote" button that goes straight to your intake form</li>
      </ul>
    </div>

    <p style="font-size:15px;color:#4a5568;margin:0 0 24px;line-height:1.6;">
      It takes about <strong>2 minutes</strong> to enable your listing &mdash; just toggle on, set your home airport ICAO, and add the airports you serve.
    </p>

    <div style="text-align:center;margin:32px 0 24px;">
      <a href="${APP_URL}/settings/directory" style="display:inline-block;background:#007CB1;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">Enable My Listing &rarr;</a>
    </div>

    <p style="font-size:14px;color:#4a5568;margin:24px 0 0;line-height:1.6;">
      Listings are <strong>free for every plan</strong> &mdash; free, pro, business, or enterprise. The directory is meant to grow the whole detailing industry, not just paid accounts.
    </p>

    <p style="font-size:14px;color:#4a5568;margin:18px 0 0;line-height:1.6;">
      If you have any questions, just reply to this email and I'll answer personally.
    </p>

    <p style="font-size:14px;color:#4a5568;margin:18px 0 0;line-height:1.6;">
      Cheers,<br>
      Brett<br>
      <span style="color:#9ca3af;font-size:13px;">Founder, Shiny Jets</span>
    </p>
  </div>

  <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">
    <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(detailer.email)}" style="color:#aaa;text-decoration:underline;">Unsubscribe</a> &middot; Shiny Jets CRM
  </p>
</div></body></html>`;

    const text = `Hi ${firstName},

I just launched directory.shinyjets.com — an interactive globe where aircraft owners can find certified detailers near their home airport. ${company} is not listed yet.

Owners are already searching for detailers near KTEB, KLAS, KCNO, KSFO, and dozens of other airports. When they find you, they can request a quote with one click — straight into your CRM inbox.

Your listing will show:
- A pin at your home airport
- Business name and logo
- Services you offer
- Online Booking badge (if Stripe is connected)
- Request a Quote button

It takes about 2 minutes to set up. Listings are free for every plan.

Enable your listing: ${APP_URL}/settings/directory

If you have any questions, just reply.

Cheers,
Brett
Founder, Shiny Jets`;

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: detailer.email,
        subject: 'Get found by aircraft owners — enable your free directory listing',
        html,
        text,
        reply_to: 'brett@shinyjets.com',
      });

      // Mark as invited (column-stripping retry in case column doesn't exist yet)
      try {
        await supabase
          .from('detailers')
          .update({ directory_invite_sent_at: new Date().toISOString() })
          .eq('id', detailer.id);
      } catch (e) {
        console.log('[directory-invite] Could not mark sent_at (column may be missing):', e?.message);
      }

      sent++;
      console.log('[directory-invite] Sent to:', detailer.email);
    } catch (err) {
      failed++;
      console.error('[directory-invite] Failed for', detailer.email, err.message);
    }
  }

  return Response.json({ total: detailers.length, sent, failed, skipped });
}
