import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { quote_id } = await request.json();
  if (!quote_id) return Response.json({ error: 'quote_id required' }, { status: 400 });

  const supabase = getSupabase();

  // Get quote
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('id, client_name, client_email, aircraft_type, aircraft_model, tail_number, share_link, detailer_id, total_price')
    .eq('id', quote_id)
    .eq('detailer_id', user.id)
    .single();

  if (qErr || !quote) return Response.json({ error: 'Quote not found' }, { status: 404 });
  if (!quote.client_email) return Response.json({ error: 'No customer email on record' }, { status: 400 });

  // Get detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('company, name, email, google_review_url')
    .eq('id', user.id)
    .single();

  // Get after photos
  const { data: media } = await supabase
    .from('job_media')
    .select('url, notes, surface_tag')
    .eq('quote_id', quote_id)
    .ilike('media_type', 'after%')
    .limit(12);

  const aircraft = [quote.aircraft_type, quote.aircraft_model].filter(Boolean).join(' ') || 'your aircraft';
  const companyName = detailer?.company || detailer?.name || 'Your detailer';
  const deliveryToken = crypto.randomBytes(16).toString('hex');

  // Build photo grid HTML
  let photoHtml = '';
  if (media?.length > 0) {
    const photoItems = media.map(m =>
      `<td style="padding:4px;"><img src="${m.url}" alt="${m.surface_tag || ''}" style="width:180px;height:120px;object-fit:cover;border-radius:8px;" /></td>`
    );
    // 3 per row
    const rows = [];
    for (let i = 0; i < photoItems.length; i += 3) {
      rows.push(`<tr>${photoItems.slice(i, i + 3).join('')}</tr>`);
    }
    photoHtml = `
      <h3 style="color:#333;margin:24px 0 12px;">Your Aircraft Photos</h3>
      <table cellpadding="0" cellspacing="0">${rows.join('')}</table>
    `;
  }

  // Send delivery email
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return Response.json({ error: 'Email not configured' }, { status: 500 });

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: quote.client_email,
      from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
      reply_to: detailer?.email || undefined,
      subject: `Your ${aircraft} detail is complete - ${companyName}`,
      html: `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#333;">Your Detail is Complete!</h2>
        <p>Hi ${quote.client_name || 'there'},</p>
        <p><strong>${companyName}</strong> has finished detailing ${aircraft}${quote.tail_number ? ` (${quote.tail_number})` : ''}.</p>
        ${photoHtml}
        <p style="margin-top:24px;">
          <a href="https://crm.shinyjets.com/q/${quote.share_link}" style="background:#007CB1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Full Details</a>
        </p>
        <p style="color:#666;font-size:13px;margin-top:24px;">Thank you for choosing ${companyName}. We look forward to serving you again.</p>
        <p style="color:#999;font-size:12px;margin-top:24px;">Shiny Jets CRM</p>
      </body></html>`,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.text();
    return Response.json({ error: 'Failed to send email', detail: err }, { status: 500 });
  }

  // Update job record
  await supabase.from('jobs')
    .update({ delivery_link_sent: true, delivery_link: `https://crm.shinyjets.com/q/${quote.share_link}` })
    .eq('quote_id', quote_id);

  // Also mark on quote
  await supabase.from('quotes')
    .update({ delivery_sent_at: new Date().toISOString() })
    .eq('id', quote_id);

  return Response.json({ success: true, email: quote.client_email });
}
