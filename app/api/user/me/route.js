import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function buildUserResponse(data, isAdmin, { includeRemit = false } = {}) {
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    phone: data.phone,
    company: data.company,
    mailing_address_line1: data.mailing_address_line1 || null,
    mailing_address_line2: data.mailing_address_line2 || null,
    mailing_city: data.mailing_city || null,
    mailing_state: data.mailing_state || null,
    mailing_zip: data.mailing_zip || null,
    mailing_country: data.mailing_country || 'US',
    // ACH fields are only included when the caller explicitly asks for remit
    // info (e.g. the detailer editing their own settings or rendering their
    // own invoice). They are never returned in general user-profile fetches.
    ...(includeRemit ? {
      ach_routing_number: data.ach_routing_number || null,
      ach_account_number: data.ach_account_number || null,
      ach_account_name: data.ach_account_name || null,
      ach_bank_name: data.ach_bank_name || null,
    } : {}),
    plan: isAdmin ? 'enterprise' : (data.plan || 'free'),
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
    logo_light_url: data.logo_light_url || null,
    logo_dark_url: data.logo_dark_url || null,
    terms_accepted_version: data.terms_accepted_version || null,
    subscription_status: data.subscription_status || null,
    subscription_source: data.subscription_source || null,
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
    insurance_url: data.insurance_url || null,
    insurance_expiry_date: data.insurance_expiry_date || null,
    insurance_verified: data.insurance_verified || false,
    insurance_insurer: data.insurance_insurer || null,
    certifications: data.certifications || [],
    directory_description: data.directory_description || '',
    has_online_booking: data.has_online_booking || false,
    verified_finish: data.verified_finish || false,
  };
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Return fresh user data for the authenticated user.
// Pass ?include_remit=1 to additionally receive sensitive ACH remit fields
// (routing/account number). Default responses exclude them.
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includeRemit = searchParams.get('include_remit') === '1';

  // Explicit allowlist — never select password_hash, stripe_secret_key,
  // stripe_publishable_key, or webauthn_challenge. ACH fields are added below
  // only when includeRemit is requested.
  const baseCols = 'id, email, name, phone, company, plan, status, rates, notification_settings, price_reminder_months, quote_display_preference, quote_display_mode, quote_package_name, quote_show_breakdown, quote_itemized_checkout, efficiency_factor, default_labor_rate, sms_enabled, preferred_currency, country, home_airport, airports_served, listed_in_directory, notify_quote_viewed, cc_fee_mode, pass_fee_to_customer, followup_discount_percent, logo_url, logo_light_url, logo_dark_url, terms_accepted_version, subscription_status, subscription_source, created_at, onboarding_completed, availability, notify_weekly_digest, review_request_enabled, review_request_delay_days, theme_primary, portal_theme, theme_logo_url, booking_mode, deposit_percentage, google_business_url, google_reviews_last_synced, calendly_url, use_calendly_scheduling, website_url, insurance_url, insurance_expiry_date, insurance_verified, insurance_insurer, mailing_address_line1, mailing_address_line2, mailing_city, mailing_state, mailing_zip, mailing_country, certifications, directory_description, has_online_booking, verified_finish';
  const select = includeRemit
    ? `${baseCols}, ach_routing_number, ach_account_number, ach_account_name, ach_bank_name`
    : baseCols;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('detailers')
    .select(select)
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  const isAdmin = ADMIN_EMAILS.includes(data.email?.toLowerCase());

  return Response.json({
    user: buildUserResponse(data, isAdmin, { includeRemit }),
  });
}
