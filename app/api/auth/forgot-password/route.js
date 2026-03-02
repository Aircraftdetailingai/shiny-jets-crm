import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { SignJWT } from 'jose';

export const dynamic = 'force-dynamic';

let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
  return _resend;
}

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.vectorav.ai';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Vector <quotes@downwindpro.com>';

function resetEmailHtml(resetLink) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f3f4f6;">
  <div style="background: #1e3a5f; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Reset Your Password</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="margin: 0 0 16px 0; font-size: 16px;">You requested a password reset for your Vector account.</p>
    <p style="margin: 0 0 24px 0; font-size: 16px;">Click the button below to set a new password. This link expires in 1 hour.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetLink}" style="display: inline-block; background: linear-gradient(to right, #f59e0b, #d97706); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
        Reset Password
      </a>
    </div>
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">If the button doesn't work, copy and paste this link:</p>
    <p style="margin: 0 0 24px 0; font-size: 13px; color: #9ca3af; word-break: break-all;">${resetLink}</p>
    <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 16px;">
      <p style="margin: 0; font-size: 13px; color: #9ca3af;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
    </div>
  </div>
  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">Powered by <strong>Vector</strong> - Aircraft Detailing Software</p>
  </div>
</body>
</html>`.trim();
}

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = getSupabase();

    // Look up the detailer
    const { data: detailer } = await supabase
      .from('detailers')
      .select('id, email, name')
      .eq('email', normalizedEmail)
      .single();

    // Always return success to prevent email enumeration
    if (!detailer) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    // Create a short-lived reset token (1 hour)
    const resetToken = await new SignJWT({
      id: detailer.id,
      email: detailer.email,
      purpose: 'password_reset',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(JWT_SECRET);

    const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

    // Send branded email via Resend
    const { error: emailError } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: detailer.email,
      subject: 'Reset your Vector password',
      html: resetEmailHtml(resetLink),
      text: `Reset your Vector password.\n\nClick this link to set a new password (expires in 1 hour):\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
    });

    if (emailError) {
      console.error('Failed to send reset email:', emailError);
      return new Response(JSON.stringify({ error: 'Failed to send email' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Forgot password error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
