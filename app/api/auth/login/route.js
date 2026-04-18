import { createClient } from '@supabase/supabase-js';
import { comparePassword, hashPassword, createToken } from '../../../../lib/auth';
import { cookies } from 'next/headers';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
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

    // Look up the detailer — only columns needed for the login flow.
    // Profile fields (phone, company, rates, theme, etc.) are fetched via
    // /api/user/me so we don't pull ACH and other sensitive columns on login.
    const { data, error } = await supabase
      .from('detailers')
      .select('id, email, password_hash, name, status, plan, is_admin, must_change_password, onboarding_complete')
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
      // Explicitly delete any stale auth_token cookie before issuing a fresh one
      // so a prior session can't shadow the new login.
      cookieStore.delete('auth_token');
      cookieStore.set('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days // 7 days
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
      plan: isAdmin ? 'enterprise' : (data.plan || 'free'),
      is_admin: isAdmin,
      status: data.status,
      rates: data.rates || {},
      notification_settings: data.notification_settings || {},
      price_reminder_months: data.price_reminder_months || 6,
      quote_display_preference: data.quote_display_preference || 'package',
      efficiency_factor: data.efficiency_factor || 1.0,
      default_labor_rate: data.default_labor_rate || 25,
      sms_enabled: isAdmin ? true : (data.sms_enabled !== false),
      currency: data.preferred_currency || 'USD',
      country: data.country || null,
      home_airport: data.home_airport || null,
      airports_served: data.airports_served || [],
      listed_in_directory: data.listed_in_directory || false,
      notify_quote_viewed: data.notify_quote_viewed || false,
      cc_fee_mode: data.cc_fee_mode || 'absorb',
      pass_fee_to_customer: data.pass_fee_to_customer || false,
      followup_discount_percent: data.followup_discount_percent || 10,
      logo_url: data.logo_url || null,
      terms_accepted_version: data.terms_accepted_version || null,
      created_at: data.created_at || null,
      onboarding_completed: data.onboarding_completed || data.onboarding_complete || null,
      availability: data.availability || null,
      notify_weekly_digest: data.notify_weekly_digest !== false,
      review_request_enabled: data.review_request_enabled !== false,
      review_request_delay_days: data.review_request_delay_days || 1,
      theme_primary: data.theme_primary || '#007CB1',
      portal_theme: data.portal_theme || 'dark',
      theme_logo_url: data.theme_logo_url || null,
      booking_mode: data.booking_mode || 'pay_to_book',
      deposit_percentage: data.deposit_percentage || 25,
      google_business_url: data.google_business_url || null,
      google_reviews_last_synced: data.google_reviews_last_synced || null,
      calendly_url: data.calendly_url || null,
      use_calendly_scheduling: data.use_calendly_scheduling || false,
      website_url: data.website_url || null,
    };
    return new Response(
      JSON.stringify({ token, user, must_change_password: data.must_change_password, onboarding_complete: data.onboarding_complete !== false }),
      { status: 200 }
    );
  } catch (err) {
    console.error('Login error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
