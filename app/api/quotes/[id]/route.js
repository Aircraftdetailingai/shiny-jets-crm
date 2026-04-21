import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Allowlist of columns that PUT may mutate. Derived from
// information_schema.columns on the quotes table. Excludes write-once /
// system-managed columns: id, detailer_id, share_link, created_at, accepted_at.
// Any other key submitted on the body is silently dropped and logged.
const ALLOWED_FIELDS = [
  'aircraft_type', 'aircraft_model', 'aircraft_id',
  'services', 'selected_services', 'selected_package_id', 'selected_package_name',
  'line_items', 'addon_fees', 'addon_total',
  'total_hours', 'base_hours', 'labor_total', 'products_total',
  'total_price', 'calculated_price', 'discounted_total', 'package_savings',
  'efficiency_factor', 'access_difficulty',
  'surface_area_sqft', 'job_location', 'minimum_fee_applied',
  'status', 'notes', 'metadata',
  'client_name', 'client_email', 'client_phone',
  'poc_name', 'poc_phone', 'poc_email', 'poc_role',
  'emergency_contact_name', 'emergency_contact_phone', 'contact_notes',
  'customer_account_id',
  'tail_number', 'airport',
  'scheduled_date', 'proposed_date', 'proposed_time', 'time_preference', 'scheduling_notes',
  'valid_until',
  'sent_at', 'viewed_at', 'last_viewed_at', 'view_count', 'email_opened_at',
  'viewer_ip', 'viewer_device', 'customer_ip_address',
  'customer_agreed_terms_at', 'customer_agreed_ip',
  'expiration_warning_sent',
  'creation_started_at', 'creation_seconds',
  'is_recurring', 'recurring_enabled', 'recurring_interval', 'next_service_date',
  'followup_unopened_notified', 'followup_viewed_notified',
  'followup_5day_sent', 'followup_discount_sent',
  'followup_notviewed_sent', 'followup_viewednotaccepted_sent',
  'followup_expirywarning_sent', 'followup_availability_sent',
  'followup_expired_recovery_sent',
  'feedback_token', 'feedback_requested_at',
  'google_event_id',
  'booking_mode', 'deposit_percentage', 'deposit_amount',
  'amount_paid', 'balance_due',
  'started_at', 'paid_at', 'completed_at', 'delivery_sent_at',
  'platform_fee_rate', 'platform_fee_amount',
  'payment_method', 'payment_note',
  'discount_percent', 'discount_type', 'discount_value', 'discount_reason',
  'assigned_team_member_ids',
];

export async function GET(request, { params }) {
  const supabase = getSupabase();
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  const { data, error } = await supabase.from('quotes').select('*').eq('id', id).single();
  if (error || !data) {
    return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
  }
  if (data.detailer_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  return new Response(JSON.stringify(data), { status: 200 });
}

export async function PUT(request, { params }) {
  const supabase = getSupabase();
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  const body = await request.json();
  const { data: quote, error: fetchError } = await supabase.from('quotes').select('*').eq('id', id).single();
  if (fetchError || !quote) {
    return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
  }
  if (quote.detailer_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  // Only mutate allowlisted columns. Everything else in body is dropped so a
  // full-body PUT from a UI that carries stale/default-null values (e.g. the
  // quote builder that does not surface booking_mode) cannot wipe fields it
  // did not mean to touch. Log dropped keys so we can spot UI code that is
  // sending server-managed columns it should not be touching.
  const filteredBody = {};
  const droppedKeys = [];
  for (const [k, v] of Object.entries(body || {})) {
    if (ALLOWED_FIELDS.includes(k)) filteredBody[k] = v;
    else droppedKeys.push(k);
  }
  if (droppedKeys.length > 0) {
    console.warn('[quote-put] dropped fields', { quote_id: id, dropped_keys: droppedKeys });
  }
  if (Object.keys(filteredBody).length === 0) {
    // Nothing to update — return the existing row so the client sees a 200.
    return new Response(JSON.stringify(quote), { status: 200 });
  }

  const { data, error } = await supabase.from('quotes').update(filteredBody).eq('id', id).select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify(data), { status: 200 });
}

export async function DELETE(request, { params }) {
  const supabase = getSupabase();
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const { id } = params;
  const { data: quote, error: fetchError } = await supabase.from('quotes').select('detailer_id').eq('id', id).single();
  if (fetchError || !quote) {
    return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
  }
  if (quote.detailer_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const { error } = await supabase.from('quotes').delete().eq('id', id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ success: true }), { status: 200 });
}
