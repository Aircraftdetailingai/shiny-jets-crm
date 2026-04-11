import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { Resend } from 'resend';

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

  const { email } = await request.json();
  if (!email) return Response.json({ error: 'Email is required' }, { status: 400 });

  const supabase = getSupabase();

  // Get or create referral code
  const { data: detailer } = await supabase
    .from('detailers')
    .select('referral_code, name, company')
    .eq('id', user.id)
    .single();

  let referralCode = detailer?.referral_code;
  if (!referralCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    referralCode = '';
    for (let i = 0; i < 8; i++) referralCode += chars.charAt(Math.floor(Math.random() * chars.length));
    await supabase.from('detailers').update({ referral_code: referralCode }).eq('id', user.id);
  }

  const signupUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com'}/signup?ref=${referralCode}`;
  const senderName = detailer?.company || detailer?.name || 'A colleague';

  // Send invite email
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
      to: email,
      subject: `${senderName} invited you to join Shiny Jets CRM`,
      reply_to: 'support@shinyjets.com',
      headers: {
        'List-Unsubscribe': '<mailto:unsubscribe@shinyjets.com?subject=Unsubscribe>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f0f0ee;">
  <div style="background:linear-gradient(135deg,#007CB1 0%,#0a1520 100%);padding:36px 30px;border-radius:12px 12px 0 0;text-align:center;">
    <span style="color:#fff;font-size:30px;font-weight:800;letter-spacing:-0.5px;">Shiny Jets CRM</span>
    <h1 style="color:#007CB1;margin:8px 0 0;font-size:16px;font-weight:400;">You've Been Invited</h1>
  </div>
  <div style="background:#fff;padding:32px 30px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:16px;margin-bottom:20px;">
      <strong>${senderName}</strong> thinks you'd love <strong>Shiny Jets CRM</strong> — the quoting and client management platform built for aircraft detailing professionals.
    </p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${signupUrl}" style="display:inline-block;background:#007CB1;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:4px;font-weight:600;font-size:15px;">
        Get Started with Shiny Jets CRM
      </a>
    </div>
    <p style="font-size:13px;color:#999;text-align:center;">Sign up and both of you earn bonus points.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">Powered by <a href="https://shinyjets.com" style="color:#aaa;text-decoration:none;">Shiny Jets</a></p>
</body></html>`,
      text: `${senderName} invited you to join Shiny Jets CRM — the quoting platform built for aircraft detailers. Sign up here: ${signupUrl}`,
    });
  } catch (err) {
    console.error('Referral invite email error:', err);
    return Response.json({ error: 'Failed to send invite email' }, { status: 500 });
  }

  return Response.json({ success: true, referral_code: referralCode });
}
