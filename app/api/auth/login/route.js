import { createClient } from '@supabase/supabase-js';
import { comparePassword, hashPassword, createToken } from '../../../../lib/auth';
import { sessionTokenClaims } from '@/lib/password-change';
import { cookies } from 'next/headers';
import { normalizePlan } from '@/lib/plans';
import { teamTokenClaims, withTeamIdentity } from '@/lib/team-access';
import {
  detailerEmailQuery,
  exactEmailIlike,
  matchDetailerPassword,
  noteDuplicateDetailers,
  preferredDetailer,
} from '@/lib/auth-detailer-lookup';
import {
  LOGIN_RATE_LIMIT_MESSAGE,
  clientIpFromRequest,
  loginRateLimit,
  recordLoginFailure,
} from '@/lib/login-rate-limit';

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
    const ip = clientIpFromRequest(request);
    const rate = loginRateLimit(normalizedEmail, ip);
    if (rate.limited) {
      return new Response(JSON.stringify({ error: LOGIN_RATE_LIMIT_MESSAGE }), {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfter) },
      });
    }

    // Look up the detailer — explicit column list sized to exactly the fields
    // the response body writes back to localStorage.vector_user. We deliberately
    // never select:
    //   password_hash in the response pipeline (it is pulled here because the
    //     bcrypt compare needs it, then dropped before serialization),
    //   stripe_secret_key, stripe_publishable_key,
    //   ach_routing_number, ach_account_number, ach_account_name, ach_bank_name,
    //   webauthn_challenge.
    const LOGIN_SELECT = [
      // auth + plan/subscription state
      'id', 'email', 'password_hash', 'must_change_password',
      'status', 'plan', 'is_admin', 'onboarding_complete', 'onboarding_completed',
      'subscription_status', 'subscription_source',
      // profile
      'name', 'phone', 'company',
      'created_at', 'updated_at',
      // preferences
      'rates', 'notification_settings', 'price_reminder_months',
      'quote_display_preference', 'quote_display_mode',
      'quote_package_name', 'quote_show_breakdown', 'quote_itemized_checkout',
      'efficiency_factor', 'default_labor_rate', 'sms_enabled',
      'preferred_currency', 'country', 'home_airport', 'airports_served',
      'listed_in_directory', 'notify_quote_viewed',
      'cc_fee_mode', 'pass_fee_to_customer', 'followup_discount_percent',
      'terms_accepted_version',
      'availability', 'notify_weekly_digest',
      'review_request_enabled', 'review_request_delay_days',
      'booking_mode', 'deposit_percentage',
      // branding / theme — read by Sidebar, Send-Quote modal, theme init
      'theme_primary', 'theme_accent', 'theme_bg', 'theme_surface',
      'portal_theme', 'theme_logo_url', 'logo_url',
      // integrations shown in UI
      'google_business_url', 'google_reviews_last_synced',
      'calendly_url', 'use_calendly_scheduling', 'website_url',
      // stripe status (non-secret — needed so client can render connection
      // state without a separate /api/stripe/status roundtrip on every page)
      'stripe_mode', 'stripe_account_id', 'stripe_onboarding_complete',
    ].join(', ');
    const { data: matches, error } = await detailerEmailQuery(
      supabase.from('detailers').select(LOGIN_SELECT),
      normalizedEmail,
    );
    if (error) {
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 });
    }

    noteDuplicateDetailers(matches, normalizedEmail);

    // Try each candidate's bcrypt hash. A duplicate row must not hide a
    // valid password stored on the other row. No detailer row is normal for
    // an invited team member — fall through to the team_members check.
    let data = matches?.length ? await matchDetailerPassword(matches, password, comparePassword) : null;
    let valid = !!data;

    // If bcrypt didn't match, try Supabase Auth. The hash is written onto
    // the preferred row: the only row, or the newest duplicate that already
    // has a password_hash.
    if (!valid && matches?.length) {
      data = preferredDetailer(matches);
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

    // Team members are not detailer rows. Their password lives on team_members
    // and the session must carry the owning shop's id and plan, or the CRM
    // sidebar and every tenant query come up empty.
    let teamMember = null;
    if (!valid) {
      const { data: teamRows, error: teamErr } = await supabase
        .from('team_members')
        .select('id, detailer_id, name, email, role, type, status, password_hash')
        .ilike('email', exactEmailIlike(normalizedEmail))
        .eq('status', 'active')
        .limit(5);
      if (!teamErr && teamRows?.length) {
        for (const row of teamRows) {
          if (!row.password_hash || !row.detailer_id) continue;
          if (await comparePassword(password, row.password_hash)) {
            const { data: owner, error: ownerErr } = await supabase
              .from('detailers')
              .select(LOGIN_SELECT)
              .eq('id', row.detailer_id)
              .maybeSingle();
            if (!ownerErr && owner) {
              data = owner;
              teamMember = row;
              valid = true;
              break;
            }
          }
        }
      }
    }

    if (!valid) {
      recordLoginFailure(normalizedEmail, ip);
      return new Response(JSON.stringify({ error: 'Invalid email or password' }), { status: 401 });
    }

    const token = await createToken(teamMember ? teamTokenClaims(teamMember, data.id) : sessionTokenClaims(data));

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

    const isAdmin = teamMember ? false : ADMIN_EMAILS.includes(data.email?.toLowerCase());
    let user = {
      id: data.id,
      email: data.email,
      name: data.name,
      phone: data.phone,
      company: data.company,
      plan: isAdmin ? 'business' : normalizePlan(data.plan),
      plan_raw: data.plan || 'free',
      subscription_status: data.subscription_status || null,
      subscription_source: data.subscription_source || null,
      is_admin: isAdmin,
      status: data.status,
      rates: data.rates || {},
      notification_settings: data.notification_settings || {},
      price_reminder_months: data.price_reminder_months || 6,
      quote_display_preference: data.quote_display_preference || 'package',
      quote_display_mode: data.quote_display_mode || 'itemized',
      quote_package_name: data.quote_package_name || 'Aircraft Detail Package',
      quote_show_breakdown: data.quote_show_breakdown || false,
      quote_itemized_checkout: data.quote_itemized_checkout !== false,
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
      stripe_mode: data.stripe_mode || 'test',
      stripe_account_id: data.stripe_account_id || null,
      stripe_onboarding_complete: !!data.stripe_onboarding_complete,
      ai_access_until: null,
    };
    // Standalone Detailing AI access (detailers.ai_access_until). Read separately so a
    // missing column (migration not applied yet) can never break login.
    try {
      const { data: ai, error: aiErr } = await supabase
        .from('detailers').select('ai_access_until').eq('id', data.id).maybeSingle();
      if (!aiErr) user.ai_access_until = ai?.ai_access_until || null;
    } catch {}
    if (teamMember) user = withTeamIdentity(user, teamMember);
    return new Response(
      JSON.stringify({
        token,
        user,
        must_change_password: teamMember ? false : data.must_change_password,
        onboarding_complete: teamMember ? true : data.onboarding_complete !== false,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error('Login error:', err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
