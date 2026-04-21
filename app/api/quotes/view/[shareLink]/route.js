import { createClient } from '@supabase/supabase-js';
import { notifyQuoteViewed } from '@/lib/push';
import { sendQuoteViewedEmail } from '@/lib/email';
import { notifyQuoteViewedInApp } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request, { params }) {
  const supabase = getSupabase();
  const { shareLink } = params;

  // Fetch quote by share link
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('share_link', shareLink)
    .single();

  if (error || !quote) {
    return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
  }

  // Fetch detailer info — explicit column list. The public-facing branches
  // below read these fields; server-only fields (fcm_token, notify_quote_viewed,
  // stripe_secret_key, stripe_account_id) are selected because the route logic
  // needs them, but they are scrubbed from the response shape below.
  // Never select password_hash, stripe_publishable_key, ach_routing_number,
  // ach_account_number, or webauthn_challenge into a public response.
  const { data: detailer } = await supabase
    .from('detailers')
    .select([
      // public — used by app/q/[shareLink]/page.jsx
      'id', 'company', 'phone', 'email',
      'logo_url', 'theme_logo_url',
      'portal_theme', 'theme_primary', 'theme_accent', 'theme_bg', 'theme_surface',
      'font_embed_url', 'font_heading', 'font_body',
      'preferred_currency',
      'booking_mode', 'deposit_percentage', 'deposit_amount', 'payment_method',
      'availability', 'calendly_url', 'use_calendly_scheduling',
      'quote_display_mode', 'quote_package_name', 'quote_show_breakdown',
      'quote_display_preference',
      'plan', 'pass_fee_to_customer', 'cc_fee_mode',
      'disclaimer_text', 'terms_text', 'terms_pdf_url',
      // server-only — stripped from the response shape
      'fcm_token', 'notify_quote_viewed', 'stripe_secret_key', 'stripe_account_id',
    ].join(', '))
    .eq('id', quote.detailer_id)
    .single();

  // Track view (only if not already paid)
  if (quote.status !== 'paid' && quote.status !== 'approved') {
    const now = new Date().toISOString();
    const isFirstView = !quote.viewed_at;
    const viewCount = (quote.view_count || 0) + 1;
    const viewerIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
    const viewerDevice = request.headers.get('user-agent') || null;

    // Update quote with view tracking
    const updateData = {
      status: 'viewed',
      last_viewed_at: now,
      view_count: viewCount,
      viewer_ip: viewerIp,
      viewer_device: viewerDevice,
    };

    // Only set viewed_at on first view
    if (isFirstView) {
      updateData.viewed_at = now;
    }

    await supabase
      .from('quotes')
      .update(updateData)
      .eq('id', quote.id);

    // Send notifications on first view only, if detailer opted in
    if (isFirstView && detailer?.notify_quote_viewed) {
      // Send push notification
      if (detailer?.fcm_token) {
        notifyQuoteViewed({ fcmToken: detailer.fcm_token, quote }).catch(console.error);
      }

      // Send email notification to detailer
      if (detailer?.email) {
        sendQuoteViewedEmail({
          quote,
          detailer,
          viewedAt: now,
        }).catch(err => console.error('Failed to send quote viewed email:', err));
      }

      // Create in-app notification
      if (detailer?.id) {
        notifyQuoteViewedInApp({ detailerId: detailer.id, quote }).catch(console.error);
      }
    }
  }

  // Check if detailer has active Stripe connection
  let stripeConnected = false;
  // If detailer has their own Stripe API keys, treat as connected (direct
  // charges) — but only when the key prefix agrees with the account's
  // stripe_mode. A mismatch means checkout will fail, so we should not
  // advertise "connected" to the customer.
  if (detailer?.stripe_secret_key) {
    const sk = detailer.stripe_secret_key;
    const keyMode = sk.startsWith('sk_live_') ? 'live'
      : sk.startsWith('sk_test_') ? 'test'
      : null;
    const accountMode = detailer?.stripe_mode || 'test';
    if (keyMode && keyMode !== accountMode) {
      console.error(`[quote-view] Stripe mode/key mismatch for detailer ${detailer.id} — key=${keyMode} account=${accountMode}; treating as not connected`);
      stripeConnected = false;
    } else {
      stripeConnected = true;
      console.log(`[quote-view] Stripe: detailer has own API keys — connected`);
    }
  } else if (detailer?.stripe_account_id && process.env.STRIPE_SECRET_KEY) {
    // Connect account — verify via platform key
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const account = await stripe.accounts.retrieve(detailer.stripe_account_id);
      console.log(`[quote-view] Stripe Connect ${detailer.stripe_account_id}: charges=${account.charges_enabled} payouts=${account.payouts_enabled}`);
      stripeConnected = account.charges_enabled && account.payouts_enabled;
    } catch (e) {
      console.error('Stripe account check failed:', e.message);
    }
  }

  // Strip every server-only / sensitive field before shipping to the public
  // share-link response. stripe_secret_key and stripe_account_id were being
  // leaked before; we also guard against any future columns by only returning
  // the allowlisted public fields.
  const {
    fcm_token, stripe_account_id, stripe_secret_key, notify_quote_viewed,
    password_hash,
    ...detailerPublic
  } = detailer || {};

  return new Response(JSON.stringify({
    quote: {
      ...quote,
      view_count: (quote.view_count || 0) + 1,
      last_viewed_at: new Date().toISOString(),
    },
    detailer: detailerPublic,
    stripe_connected: stripeConnected,
  }), { status: 200 });
}
