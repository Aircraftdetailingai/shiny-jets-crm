import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { detectKeyMode } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Non-Stripe whitelist. Stripe key fields go through the validated path below.
const ALLOWED_FIELDS = [
  'calendly_url',
  'use_calendly_scheduling',
  'chargeback_terms_accepted_at',
  'quote_display_mode',
  'quote_package_name',
  'quote_show_breakdown',
  'quote_itemized_checkout',
];

function normalize(key) {
  return (key || '').replace(/^["']|["']$/g, '').replace(/\\n/g, '').trim();
}

async function handleStripeKeySave({ user, body, supabase }) {
  const pk = normalize(body.stripe_publishable_key);
  const sk = normalize(body.stripe_secret_key);

  if (!pk || !sk) {
    return Response.json({ error: 'Both stripe_publishable_key and stripe_secret_key are required' }, { status: 400 });
  }

  if (!(pk.startsWith('pk_test_') || pk.startsWith('pk_live_'))) {
    return Response.json({ error: 'Invalid publishable key — must start with pk_test_ or pk_live_' }, { status: 400 });
  }
  if (!(sk.startsWith('sk_test_') || sk.startsWith('sk_live_'))) {
    return Response.json({ error: 'Invalid secret key — must start with sk_test_ or sk_live_' }, { status: 400 });
  }

  const pkMode = pk.startsWith('pk_live_') ? 'live' : 'test';
  const skMode = detectKeyMode(sk);
  if (pkMode !== skMode) {
    return Response.json({
      error: `Stripe mode mismatch — publishable key is ${pkMode} but secret key is ${skMode}. Both keys must be from the same mode.`,
    }, { status: 400 });
  }

  // Verify the secret key works against Stripe's API before persisting.
  // stripe.accounts.retrieve() with no arg returns the authenticated account —
  // if the key is invalid/revoked/malformed, Stripe will throw with a clear
  // type (StripeAuthenticationError / StripePermissionError) that we surface
  // back to the user without saving.
  let accountEmail = null;
  try {
    const stripe = new Stripe(sk, { apiVersion: '2023-10-16', maxNetworkRetries: 0, timeout: 15000 });
    const account = await stripe.accounts.retrieve();
    accountEmail = account?.email || null;
  } catch (err) {
    console.error('[user/settings] Stripe key verification failed for detailer', user.id, err?.type || '', err?.message || err);
    const msg = err?.type === 'StripeAuthenticationError'
      ? 'Invalid Stripe key — Stripe rejected the secret key'
      : err?.type === 'StripePermissionError'
        ? 'Stripe key is valid but lacks permissions needed by Vector'
        : `Stripe verification failed: ${err?.message || 'unknown error'}`;
    return Response.json({ error: msg }, { status: 400 });
  }

  const updates = {
    stripe_publishable_key: pk,
    stripe_secret_key: sk,
    stripe_mode: skMode,
    stripe_onboarding_complete: true,
  };

  const { error } = await supabase.from('detailers').update(updates).eq('id', user.id);
  if (error) {
    console.error('[user/settings] Failed to save Stripe keys for detailer', user.id, error.message);
    return Response.json({ error: 'Failed to save Stripe keys' }, { status: 500 });
  }

  return Response.json({
    success: true,
    stripe_mode: skMode,
    stripe_onboarding_complete: true,
    has_keys: true,
    account_email: accountEmail,
  });
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = getSupabase();

  // Stripe-key submissions take a dedicated validated path. The generic
  // settings endpoint never writes to stripe_* columns otherwise.
  if (body?.stripe_publishable_key !== undefined || body?.stripe_secret_key !== undefined) {
    return handleStripeKeySave({ user, body, supabase });
  }

  const updates = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { error } = await supabase.from('detailers').update(updates).eq('id', user.id);
  if (error) {
    console.error('[user/settings] Failed to update settings for detailer', user.id, error.message);
    return Response.json({ error: 'Failed to save settings' }, { status: 500 });
  }

  return Response.json({ success: true });
}
