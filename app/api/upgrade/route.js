import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { TIERS } from '@/lib/pricing-tiers';
import { normalizePlan, planRank } from '@/lib/plans';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

async function getStripe() {
  const Stripe = (await import('stripe')).default;
  return new Stripe(process.env.STRIPE_SECRET_KEY?.trim());
}

// POST - Start Stripe checkout for subscription upgrade
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { tier: rawTier, billing, promo_code } = await request.json();
  const isAnnual = billing === 'annual';
  const tier = rawTier ? normalizePlan(rawTier) : null;

  if (!tier || tier === 'free' || !TIERS[tier]) {
    return new Response(JSON.stringify({ error: 'Invalid tier' }), { status: 400 });
  }

  const tierConfig = TIERS[tier];
  const priceId = isAnnual ? tierConfig.stripeAnnualPriceId : tierConfig.stripePriceId;
  if (!priceId) {
    // Shopify is the primary billing path; Stripe checkout only works when
    // STRIPE_PRICE_LITE / STRIPE_PRICE_BUSINESS_V2 / _YEARLY are configured.
    return new Response(JSON.stringify({ error: 'Online checkout for this plan is not available here. Visit the upgrade page.', upgrade_url: '/upgrade' }), { status: 400 });
  }

  const supabase = getSupabase();
  const stripe = await getStripe();

  try {
    // Get detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('email, company, stripe_customer_id, plan')
      .eq('id', user.id)
      .single();

    // Check if already on this tier or higher
    const currentTierIndex = planRank(detailer?.plan);
    const targetTierIndex = planRank(tier);

    if (targetTierIndex <= currentTierIndex) {
      return new Response(JSON.stringify({
        error: 'You are already on this tier or higher'
      }), { status: 400 });
    }

    // Get or create Stripe customer
    let customerId = detailer?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: detailer?.email || user.email,
        name: detailer?.company || undefined,
        metadata: {
          detailer_id: user.detailer_id || user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID
      await supabase
        .from('detailers')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Validate promo code if provided
    let stripeCouponId = null;
    let promoData = null;

    if (promo_code) {
      const normalizedCode = promo_code.trim().toUpperCase();

      const { data: promo, error: promoError } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('code', normalizedCode)
        .single();

      if (promoError || !promo) {
        return new Response(JSON.stringify({ error: 'Invalid promo code' }), { status: 400 });
      }

      // Check validity
      const now = new Date().toISOString().slice(0, 10);
      if (promo.valid_from && now < promo.valid_from) {
        return new Response(JSON.stringify({ error: 'Promo code not yet active' }), { status: 400 });
      }
      if (promo.valid_until && now > promo.valid_until) {
        return new Response(JSON.stringify({ error: 'Promo code has expired' }), { status: 400 });
      }
      if (promo.max_uses && promo.times_used >= promo.max_uses) {
        return new Response(JSON.stringify({ error: 'Promo code fully redeemed' }), { status: 400 });
      }

      promoData = promo;

      // Create Stripe coupon based on discount type
      const couponParams = {
        metadata: { promo_code: normalizedCode },
      };

      switch (promo.discount_type) {
        case 'first_month_free':
          couponParams.percent_off = 100;
          couponParams.duration = 'once';
          couponParams.name = `${normalizedCode} - First Month Free`;
          break;
        case 'percent_off':
          couponParams.percent_off = parseFloat(promo.discount_value);
          couponParams.duration = 'repeating';
          couponParams.duration_in_months = 12;
          couponParams.name = `${normalizedCode} - ${promo.discount_value}% Off for 12 months`;
          break;
        case 'flat_off':
          couponParams.amount_off = Math.round(parseFloat(promo.discount_value) * 100); // cents
          couponParams.currency = 'usd';
          couponParams.duration = 'once';
          couponParams.name = `${normalizedCode} - $${promo.discount_value} Off`;
          break;
      }

      const coupon = await stripe.coupons.create(couponParams);
      stripeCouponId = coupon.id;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    // Build checkout session params
    const sessionParams = {
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/settings?upgrade=success&tier=${tier}`,
      cancel_url: `${appUrl}/settings?upgrade=cancelled`,
      metadata: {
        detailer_id: user.detailer_id || user.id,
        tier: tier,
        billing: isAnnual ? 'annual' : 'monthly',
        promo_code: promoData?.code || '',
      },
      subscription_data: {
        metadata: {
          detailer_id: user.detailer_id || user.id,
          tier: tier,
          billing: isAnnual ? 'annual' : 'monthly',
          promo_code: promoData?.code || '',
          min_months: promoData?.min_months ? String(promoData.min_months) : '0',
        },
      },
    };

    // Apply coupon if we have one
    if (stripeCouponId) {
      sessionParams.discounts = [{ coupon: stripeCouponId }];
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create(sessionParams);

    // Increment promo code usage
    if (promoData) {
      await supabase
        .from('promo_codes')
        .update({ times_used: (promoData.times_used || 0) + 1 })
        .eq('id', promoData.id);
    }

    return new Response(JSON.stringify({ url: session.url }), { status: 200 });
  } catch (err) {
    console.error('Upgrade checkout error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
