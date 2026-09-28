import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { normalizePlan } from '@/lib/plans';
import { resolveCrmLineItem } from '@/lib/crm-plan-grants';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// GET: Check env var status
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({
    shopify_webhook_secret: !!process.env.SHOPIFY_WEBHOOK_SECRET && process.env.SHOPIFY_WEBHOOK_SECRET !== 'your_shopify_secret',
    shopify_store_url: process.env.SHOPIFY_STORE_URL || null,
    next_public_app_url: process.env.NEXT_PUBLIC_APP_URL || null,
    webhook_endpoint: `${process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com'}/api/shopify/webhook`,
    alt_webhook_endpoint: `${process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com'}/api/webhooks/shopify`,
  });
}

// POST: Simulate a Shopify order/paid webhook
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user || !ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email, plan: rawPlan = 'lite' } = await request.json();
  const plan = normalizePlan(rawPlan);
  const testEmail = email?.toLowerCase()?.trim();
  if (!testEmail) {
    return Response.json({ error: 'Email is required' }, { status: 400 });
  }

  const priceMap = { free: '0.00', lite: '39.95', business: '89.95' };
  const price = priceMap[plan] || '39.95';

  const supabase = getSupabase();
  const results = { steps: [], success: false };

  // Step 1: Check if detailer exists
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, email, plan, subscription_status, subscription_source, shopify_customer_id')
    .eq('email', testEmail)
    .single();

  if (detailer) {
    results.steps.push({
      step: 'find_detailer',
      status: 'found',
      detail: `Found detailer ${detailer.id} (${detailer.email}), current plan: ${detailer.plan}`,
    });

    // Step 2: Simulate upgrade
    const { error } = await supabase
      .from('detailers')
      .update({
        plan,
        subscription_status: 'active',
        shopify_customer_id: 'test_shopify_customer_123',
        subscription_source: 'shopify',
      })
      .eq('id', detailer.id);

    if (error) {
      results.steps.push({
        step: 'update_plan',
        status: 'error',
        detail: error.message,
      });
    } else {
      results.steps.push({
        step: 'update_plan',
        status: 'success',
        detail: `Upgraded ${testEmail} from ${detailer.plan} to ${plan}`,
      });
      results.success = true;
    }
  } else {
    results.steps.push({
      step: 'find_detailer',
      status: 'not_found',
      detail: `No detailer with email ${testEmail}`,
    });

    // Step 2: Would create beta invite (don't actually send email in test)
    results.steps.push({
      step: 'create_invite',
      status: 'skipped',
      detail: `Would create beta invite for ${testEmail} with ${plan} plan (skipped in test mode)`,
    });
    results.success = true;
  }

  // Step 3: Verify the simulated webhook payload would parse correctly
  const testPayload = {
    customer: { email: testEmail, id: 'test_123' },
    line_items: [{ title: `Shiny Jets CRM ${plan.charAt(0).toUpperCase() + plan.slice(1)}`, price, sku: `SJ-CRM-${plan.toUpperCase()}` }],
    order_number: 'TEST-001',
  };

  // Resolve exactly like the live webhook does
  const resolved = resolveCrmLineItem(testPayload.line_items[0]);
  const titleMatch = resolved?.plan === plan;
  const priceMatch = resolveCrmLineItem({ price }).plan === plan;

  results.steps.push({
    step: 'payload_validation',
    status: titleMatch && priceMatch ? 'success' : 'warning',
    detail: `Title match: ${titleMatch}, Price match: ${priceMatch}`,
    test_payload: testPayload,
  });

  return Response.json(results);
}
