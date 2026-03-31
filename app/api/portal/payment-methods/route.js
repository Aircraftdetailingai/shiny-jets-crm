import { getSupabase, resolvePortalCustomer } from '@/lib/portal-auth';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

let _stripe;
function getStripe() { return _stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY?.trim()); }
const stripe = new Proxy({}, { get: (_, prop) => getStripe()[prop] });

// GET - List stored payment methods
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  const resolved = await resolvePortalCustomer(token);
  if (!resolved) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: methods, error } = await supabase
    .from('customer_payment_methods')
    .select('*')
    .eq('customer_id', resolved.customer.id)
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
  }

  return Response.json({ payment_methods: methods || [] });
}

// POST - Create SetupIntent for adding a payment method
export async function POST(request) {
  const { token } = await request.json();

  const resolved = await resolvePortalCustomer(token);
  if (!resolved) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Find or create Stripe Customer
  let stripeCustomerId = null;

  // Check if we already have a Stripe customer for this customer
  const { data: existingPM } = await supabase
    .from('customer_payment_methods')
    .select('stripe_customer_id')
    .eq('customer_id', resolved.customer.id)
    .not('stripe_customer_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (existingPM?.stripe_customer_id) {
    stripeCustomerId = existingPM.stripe_customer_id;
  } else {
    // Create a new Stripe Customer
    const stripeCustomer = await stripe.customers.create({
      email: resolved.customer.email,
      name: resolved.customer.name || undefined,
      metadata: {
        vector_customer_id: resolved.customer.id,
        detailer_id: resolved.detailerId,
      },
    });
    stripeCustomerId = stripeCustomer.id;
  }

  // Create SetupIntent
  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    metadata: {
      vector_customer_id: resolved.customer.id,
      detailer_id: resolved.detailerId,
    },
  });

  return Response.json({
    client_secret: setupIntent.client_secret,
    stripe_customer_id: stripeCustomerId,
  });
}

// PUT - Set default payment method
export async function PUT(request) {
  const { token, payment_method_id } = await request.json();

  const resolved = await resolvePortalCustomer(token);
  if (!resolved) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Unset all defaults for this customer
  await supabase
    .from('customer_payment_methods')
    .update({ is_default: false })
    .eq('customer_id', resolved.customer.id);

  // Set new default
  const { error } = await supabase
    .from('customer_payment_methods')
    .update({ is_default: true })
    .eq('id', payment_method_id)
    .eq('customer_id', resolved.customer.id);

  if (error) {
    return Response.json({ error: 'Failed to update default' }, { status: 500 });
  }

  return Response.json({ success: true });
}

// DELETE - Remove payment method
export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const id = searchParams.get('id');

  const resolved = await resolvePortalCustomer(token);
  if (!resolved) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Get the payment method to detach from Stripe
  const { data: pm } = await supabase
    .from('customer_payment_methods')
    .select('stripe_payment_method_id')
    .eq('id', id)
    .eq('customer_id', resolved.customer.id)
    .single();

  if (pm?.stripe_payment_method_id) {
    try {
      await stripe.paymentMethods.detach(pm.stripe_payment_method_id);
    } catch (e) {
      console.error('Failed to detach payment method from Stripe:', e);
    }
  }

  const { error } = await supabase
    .from('customer_payment_methods')
    .delete()
    .eq('id', id)
    .eq('customer_id', resolved.customer.id);

  if (error) {
    return Response.json({ error: 'Failed to remove payment method' }, { status: 500 });
  }

  return Response.json({ success: true });
}
