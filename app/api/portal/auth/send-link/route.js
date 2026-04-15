import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { generateMagicToken } from '@/lib/portal-customer-auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) return Response.json({ error: 'Email required' }, { status: 400 });

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = getSupabase();

    // Find or create customer account
    let { data: account } = await supabase
      .from('customer_accounts')
      .select('id, email, name')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!account) {
      // Check if they have any quotes (they're a known customer)
      const { data: quote } = await supabase
        .from('quotes')
        .select('customer_name, customer_email')
        .ilike('customer_email', normalizedEmail)
        .limit(1)
        .maybeSingle();

      // Create account
      const { data: newAccount, error: createErr } = await supabase
        .from('customer_accounts')
        .insert({
          email: normalizedEmail,
          name: quote?.customer_name || normalizedEmail.split('@')[0],
        })
        .select('id, email, name')
        .single();

      if (createErr) {
        console.error('[portal/auth] create account error:', createErr.message);
        return Response.json({ error: 'Failed to create account' }, { status: 500 });
      }
      account = newAccount;
    }

    // Generate magic token with 1-hour expiry
    const token = generateMagicToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Column-stripping retry for magic_token
    let updates = { magic_token: token, magic_token_expires: expires };
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.from('customer_accounts').update(updates).eq('id', account.id);
      if (!error) break;
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
      if (colMatch) { delete updates[colMatch[1]]; continue; }
      console.error('[portal/auth] update token error:', error.message);
      break;
    }

    // Send magic link email
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://crm.shinyjets.com';
    const magicLink = `${baseUrl}/portal/auth/callback?token=${token}`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets <noreply@mail.shinyjets.com>',
      to: normalizedEmail,
      subject: 'Sign in to Your Aircraft Portal',
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:40px 20px;">
  <div style="background:#fff;border-radius:12px;padding:40px 32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="margin:0 0 8px;font-size:22px;color:#0D1B2A;">Your Aircraft Portal</h1>
    <p style="color:#666;font-size:14px;margin:0 0 28px;">Click below to sign in securely — no password needed.</p>
    <a href="${magicLink}" style="display:inline-block;background:#007CB1;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;">Sign In to Portal</a>
    <p style="color:#999;font-size:12px;margin:24px 0 0;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
  </div>
  <p style="text-align:center;color:#bbb;font-size:11px;margin-top:16px;">Powered by Shiny Jets Aviation</p>
</div></body></html>`,
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error('[portal/auth] send-link error:', err);
    return Response.json({ error: 'Failed to send login link' }, { status: 500 });
  }
}
