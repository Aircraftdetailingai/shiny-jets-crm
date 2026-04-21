import { createClient } from '@supabase/supabase-js';
import { notifyQuoteViewed } from '@/lib/push';
import { sendQuoteViewedEmail } from '@/lib/email';
import { notifyQuoteViewedInApp } from '@/lib/notifications';
import { isStripeConnected } from '@/lib/stripe';

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
      // deposit_amount and payment_method are quote-only columns — not on
      // detailers. Only booking_mode and deposit_percentage exist at the
      // detailer level. Including the quote-only columns here makes the
      // whole SELECT 400 and the public response ships an empty detailer.
      'booking_mode', 'deposit_percentage',
      'availability', 'calendly_url', 'use_calendly_scheduling',
      'quote_display_mode', 'quote_package_name', 'quote_show_breakdown',
      'quote_display_preference',
      'plan', 'pass_fee_to_customer', 'cc_fee_mode',
      'disclaimer_text', 'terms_text', 'terms_pdf_url',
      // server-only — stripped from the response shape
      'fcm_token', 'notify_quote_viewed', 'stripe_secret_key', 'stripe_account_id',
      'stripe_mode', 'stripe_onboarding_complete',
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

  // Check if detailer has active Stripe connection. Centralized in
  // lib/stripe.isStripeConnected — direct keys (with mode/prefix match) OR
  // Connect with stripe_onboarding_complete === true. Both paths skip the
  // live Stripe accounts.retrieve() call this route used to make on every
  // share-link load.
  const stripeConnected = isStripeConnected(detailer);
  if (!stripeConnected && detailer?.stripe_secret_key) {
    const sk = detailer.stripe_secret_key;
    const keyMode = sk.startsWith('sk_live_') ? 'live'
      : sk.startsWith('sk_test_') ? 'test'
      : null;
    const accountMode = detailer?.stripe_mode || 'test';
    if (keyMode && keyMode !== accountMode) {
      console.error(`[quote-view] Stripe mode/key mismatch for detailer ${detailer.id} — key=${keyMode} account=${accountMode}; treating as not connected`);
    }
  }

  // Strip every server-only / sensitive field before shipping to the public
  // share-link response. stripe_secret_key and stripe_account_id were being
  // leaked before; we also guard against any future columns by only returning
  // the allowlisted public fields.
  const {
    fcm_token, stripe_account_id, stripe_secret_key, stripe_mode,
    stripe_onboarding_complete, notify_quote_viewed,
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
