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

  // Fetch detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, name, email, phone, company, stripe_account_id, fcm_token, quote_display_preference, plan, pass_fee_to_customer, preferred_currency, terms_pdf_url, terms_text')
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

    // Send notifications on first view only
    if (isFirstView) {
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
  if (detailer?.stripe_account_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const account = await stripe.accounts.retrieve(detailer.stripe_account_id);
      stripeConnected = account.charges_enabled && account.payouts_enabled;
    } catch (e) {
      console.error('Stripe account check failed:', e.message);
    }
  }

  // Remove sensitive data from response
  const { fcm_token, stripe_account_id, ...detailerPublic } = detailer || {};

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
