import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { TIERS } from '@/lib/pricing-tiers';

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

  const { tier, billing } = await request.json();
  const isAnnual = billing === 'annual';

  if (!tier || !TIERS[tier]) {
    return new Response(JSON.stringify({ error: 'Invalid tier' }), { status: 400 });
  }

  const tierConfig = TIERS[tier];
  const priceId = isAnnual ? tierConfig.stripeAnnualPriceId : tierConfig.stripePriceId;
  if (!priceId) {
    return new Response(JSON.stringify({ error: 'Tier not available for purchase' }), { status: 400 });
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
    const tierOrder = ['free', 'pro', 'business', 'enterprise'];
    const currentTierIndex = tierOrder.indexOf(detailer?.plan || 'free');
    const targetTierIndex = tierOrder.indexOf(tier);

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
          detailer_id: user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID
      await supabase
        .from('detailers')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
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
        detailer_id: user.id,
        tier: tier,
        billing: isAnnual ? 'annual' : 'monthly',
      },
      subscription_data: {
        metadata: {
          detailer_id: user.id,
          tier: tier,
          billing: isAnnual ? 'annual' : 'monthly',
        },
      },
    });

    return new Response(JSON.stringify({ url: session.url }), { status: 200 });
  } catch (err) {
    console.error('Upgrade checkout error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
