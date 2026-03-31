import { getSupabase, resolvePortalCustomer } from '@/lib/portal-auth';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

let _stripe;
function getStripe() { return _stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY?.trim()); }
const stripe = new Proxy({}, { get: (_, prop) => getStripe()[prop] });

// POST - Confirm SetupIntent and save payment method
export async function POST(request) {
  const { token, payment_method_id, stripe_customer_id } = await request.json();

  const resolved = await resolvePortalCustomer(token);
  if (!resolved) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!payment_method_id) {
    return Response.json({ error: 'Payment method ID is required' }, { status: 400 });
  }

  // Fetch payment method details from Stripe
  const pm = await stripe.paymentMethods.retrieve(payment_method_id);

  let type = pm.type;
  let last4 = '';
  let brand = '';
  let expMonth = null;
  let expYear = null;

  if (pm.card) {
    type = 'card';
    last4 = pm.card.last4;
    brand = pm.card.brand;
    expMonth = pm.card.exp_month;
    expYear = pm.card.exp_year;
  } else if (pm.us_bank_account) {
    type = 'us_bank_account';
    last4 = pm.us_bank_account.last4;
    brand = pm.us_bank_account.bank_name || '';
  }

  const supabase = getSupabase();

  // Check if this is the first payment method — make it default
  const { data: existing } = await supabase
    .from('customer_payment_methods')
    .select('id')
    .eq('customer_id', resolved.customer.id)
    .limit(1);

  const isFirst = !existing || existing.length === 0;

  const { data, error } = await supabase
    .from('customer_payment_methods')
    .insert({
      customer_id: resolved.customer.id,
      detailer_id: resolved.detailerId,
      stripe_payment_method_id: payment_method_id,
      stripe_customer_id: stripe_customer_id || null,
      type,
      last4,
      brand,
      exp_month: expMonth,
      exp_year: expYear,
      is_default: isFirst,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to save payment method:', error);
    return Response.json({ error: 'Failed to save payment method' }, { status: 500 });
  }

  return Response.json({ payment_method: data });
}
