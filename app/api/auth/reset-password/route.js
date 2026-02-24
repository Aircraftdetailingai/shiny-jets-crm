import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';
import { hashPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return new Response(JSON.stringify({ error: 'Token and password are required' }), { status: 400 });
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), { status: 400 });
    }

    // Verify reset token
    let payload;
    try {
      const result = await jwtVerify(token, JWT_SECRET);
      payload = result.payload;
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Reset link has expired or is invalid. Please request a new one.' }), { status: 400 });
    }

    // Ensure this is a password reset token
    if (payload.purpose !== 'password_reset') {
      return new Response(JSON.stringify({ error: 'Invalid reset token' }), { status: 400 });
    }

    const supabase = getSupabase();

    // Hash new password
    const newHash = await hashPassword(password);

    // Update the detailer's password
    const { error } = await supabase
      .from('detailers')
      .update({
        password_hash: newHash,
        must_change_password: false,
      })
      .eq('id', payload.id);

    if (error) {
      console.error('Failed to update password:', error);
      return new Response(JSON.stringify({ error: 'Failed to update password' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Reset password error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
