import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function buildUserResponse(data, isAdmin) {
  return {
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

// GET - Return fresh user data for the authenticated user
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('detailers')
    .select('id, email, name, phone, company, plan, status, rates, notification_settings, price_reminder_months, quote_display_preference, efficiency_factor, default_labor_rate, sms_enabled, preferred_currency, country, home_airport, airports_served, listed_in_directory, notify_quote_viewed, cc_fee_mode, pass_fee_to_customer, followup_discount_percent, logo_url, terms_accepted_version, created_at, onboarding_completed, availability, notify_weekly_digest, review_request_enabled, review_request_delay_days, theme_primary, portal_theme, theme_logo_url, booking_mode, deposit_percentage, google_business_url, google_reviews_last_synced, calendly_url, use_calendly_scheduling, website_url, insurance_url, insurance_expiry_date, insurance_verified, insurance_insurer')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  const isAdmin = ADMIN_EMAILS.includes(data.email?.toLowerCase());

  return Response.json({
    user: buildUserResponse(data, isAdmin),
  });
}
