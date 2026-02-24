import { createClient } from '@supabase/supabase-js';
import { comparePassword, hashPassword, createToken } from '../../../../lib/auth';
import { cookies } from 'next/headers';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
];

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
    const body = await request.json();
    const { email, password } = body || {};
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Look up the detailer
    const { data, error } = await supabase
      .from('detailers')
      .select('*')
      .eq('email', normalizedEmail)
      .single();
    if (error || !data) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 });
    }

    // Try bcrypt comparison first (passwords hashed by our app)
    let valid = false;
    if (data.password_hash) {
      try {
        valid = await comparePassword(password, data.password_hash);
      } catch (e) {
        // bcrypt comparison failed, will fall through to Supabase Auth
      }
    }

    // If bcrypt didn't match, try Supabase Auth
    if (!valid) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (!authError && authData?.user) {
          valid = true;
          const newHash = await hashPassword(password);
          await supabase.from('detailers').update({ password_hash: newHash }).eq('id', data.id);
        }
      } catch (e) {
        // Supabase Auth fallback failed
      }
    }

    if (!valid) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 });
    }

    const token = await createToken({ id: data.id, email: data.email });

    // Set auth cookie for server-side auth
    try {
      const cookieStore = await cookies();
      cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    } catch (e) {
      // Cookie setting can fail in certain contexts, non-critical
    }

    const isAdmin = ADMIN_EMAILS.includes(data.email?.toLowerCase());
    const user = {
      id: data.id,
      email: data.email,
      name: data.name,
      phone: data.phone,
      company: data.company,
      plan: isAdmin ? (data.plan === 'enterprise' ? 'enterprise' : data.plan || 'enterprise') : data.plan,
      is_admin: isAdmin,
      status: data.status,
      rates: data.rates || {},
      notification_settings: data.notification_settings || {},
      price_reminder_months: data.price_reminder_months || 6,
      quote_display_preference: data.quote_display_preference || 'package',
      efficiency_factor: data.efficiency_factor || 1.0,
      default_labor_rate: data.default_labor_rate || 25,
    };
    return new Response(
      JSON.stringify({ token, user, must_change_password: data.must_change_password }),
      { status: 200 }
    );
  } catch (err) {
    console.error('Login error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
