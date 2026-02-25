import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

/**
 * Create an in-app notification for a detailer.
 *
 * @param {Object} opts
 * @param {string} opts.detailerId - UUID of the detailer
 * @param {string} opts.type       - quote_viewed | payment_received | quote_expired | job_reminder | followup_needed
 * @param {string} opts.title      - Short headline
 * @param {string} opts.message    - Longer description
 * @param {string} [opts.link]     - Optional in-app link
 * @param {Object} [opts.metadata] - Optional extra data (quote_id, amount, etc.)
 */
export async function createNotification({ detailerId, type, title, message, link, metadata }) {
  const supabase = getSupabase();

  const { error } = await supabase.from('notifications').insert({
    detailer_id: detailerId,
    type,
    title,
    message,
    link: link || null,
    metadata: metadata || null,
  });

  if (error) {
    console.error('Failed to create notification:', error.message);
  }
}

// Convenience helpers

export async function notifyQuoteViewedInApp({ detailerId, quote }) {
  const aircraft = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const client = quote.client_name || 'A client';
  await createNotification({
    detailerId,
    type: 'quote_viewed',
    title: 'Quote Viewed',
    message: `${client} viewed your quote for ${aircraft}`,
    link: '/quotes',
    metadata: { quote_id: quote.id },
  });
}

export async function notifyPaymentReceived({ detailerId, quote, amount }) {
  const aircraft = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const client = quote.client_name || 'A client';
  const formatted = typeof amount === 'number' ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '';
  await createNotification({
    detailerId,
    type: 'payment_received',
    title: 'Payment Received',
    message: `${client} paid ${formatted} for ${aircraft}`,
    link: '/quotes',
    metadata: { quote_id: quote.id, amount },
  });
}

export async function notifyQuoteExpired({ detailerId, quote }) {
  const aircraft = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const client = quote.client_name || 'A client';
  await createNotification({
    detailerId,
    type: 'quote_expired',
    title: 'Quote Expired',
    message: `Your quote for ${client} (${aircraft}) has expired`,
    link: '/quotes',
    metadata: { quote_id: quote.id },
  });
}

export async function notifyJobReminder({ detailerId, quote, scheduledDate }) {
  const aircraft = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
  const client = quote.client_name || 'Client';
  await createNotification({
    detailerId,
    type: 'job_reminder',
    title: 'Job Tomorrow',
    message: `Reminder: ${aircraft} for ${client} is scheduled tomorrow`,
    link: '/calendar',
    metadata: { quote_id: quote.id, scheduled_date: scheduledDate },
  });
}
