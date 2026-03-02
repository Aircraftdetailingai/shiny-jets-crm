import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');
  return _resend;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const JWT_SECRET = process.env.JWT_SECRET || 'customer-portal-secret-key';

// Generate 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST - Request login code or verify code
export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { action, email, code, detailer_id } = await request.json();

    if (action === 'request_code') {
      // Customer requests a login code
      if (!email) {
        return Response.json({ error: 'Email required' }, { status: 400 });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if customer exists (has any quotes)
      const { data: quotes, error: quoteError } = await supabase
        .from('quotes')
        .select('id, detailer_id, customer_name, customer_email')
        .ilike('customer_email', normalizedEmail)
        .limit(1);

      if (quoteError || !quotes?.length) {
        // Don't reveal if email exists or not for security
        return Response.json({
          success: true,
          message: 'If an account exists, a login code has been sent.'
        });
      }

      // Generate and store code
      const loginCode = generateCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store code in customer_login_codes table
      await supabase
        .from('customer_login_codes')
        .upsert({
          email: normalizedEmail,
          code: loginCode,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
        }, { onConflict: 'email' });

      // Send email with code
      if (process.env.RESEND_API_KEY) {
        await getResend().emails.send({
          from: 'Vector <noreply@aircraftdetailing.ai>',
          to: normalizedEmail,
          subject: 'Your Vector Login Code',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1e3a5f;">Your Login Code</h2>
              <p>Use this code to access your customer dashboard:</p>
              <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 20px 0;">
                ${loginCode}
              </div>
              <p style="color: #666; font-size: 14px;">This code expires in 15 minutes.</p>
              <p style="color: #999; font-size: 12px;">If you didn't request this code, you can safely ignore this email.</p>
            </div>
          `,
        });
      }

      return Response.json({
        success: true,
        message: 'Login code sent to your email.'
      });
    }

    if (action === 'verify_code') {
      // Verify the login code
      if (!email || !code) {
        return Response.json({ error: 'Email and code required' }, { status: 400 });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Get stored code
      const { data: loginData, error: loginError } = await supabase
        .from('customer_login_codes')
        .select('*')
        .eq('email', normalizedEmail)
        .single();

      if (loginError || !loginData) {
        return Response.json({ error: 'Invalid or expired code' }, { status: 401 });
      }

      // Check if code matches and not expired
      if (loginData.code !== code) {
        return Response.json({ error: 'Invalid code' }, { status: 401 });
      }

      if (new Date(loginData.expires_at) < new Date()) {
        return Response.json({ error: 'Code has expired' }, { status: 401 });
      }

      // Delete used code
      await supabase
        .from('customer_login_codes')
        .delete()
        .eq('email', normalizedEmail);

      // Get customer info from their quotes
      const { data: quotes } = await supabase
        .from('quotes')
        .select('customer_name, customer_email, customer_phone, detailer_id')
        .ilike('customer_email', normalizedEmail)
        .order('created_at', { ascending: false })
        .limit(1);

      const customerInfo = quotes?.[0] || {};

      // Generate JWT token
      const token = jwt.sign(
        {
          email: normalizedEmail,
          name: customerInfo.customer_name,
          type: 'customer',
        },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      return Response.json({
        success: true,
        token,
        customer: {
          email: normalizedEmail,
          name: customerInfo.customer_name,
          phone: customerInfo.customer_phone,
        },
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (err) {
    console.error('Customer auth error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
