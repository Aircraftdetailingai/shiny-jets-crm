import { getAuthUser } from '@/lib/auth';
import { getServiceSupabase, requireAdmin } from '@/lib/ask-brett-server';
import {
  fetchShopifyOrder,
  orderFromAdminFields,
  provisionAdminCourseOrder,
} from '@/lib/course-order-provision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// POST /api/admin/course-provision
// Admin-only. Body: { order | order_id | order_number, email, customer_name?, phone?, product_title?, line_items? }
// Loads the Shopify order when SHOPIFY_ACCESS_TOKEN is set, otherwise uses the
// fields in the body. Then runs the same orders/paid provisioning as the webhook.
export async function POST(request) {
  const supabase = getServiceSupabase();
  if (!supabase) return Response.json({ ok: false, error: 'Not configured' }, { status: 503 });

  const user = await getAuthUser(request);
  const admin = await requireAdmin(user, supabase);
  if (!admin.ok) return Response.json({ ok: false, error: admin.error }, { status: admin.status });

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const email = body?.email;
  const orderRef = body?.order_id || body?.shopify_order_id || body?.order || body?.order_number || '';
  if (!orderRef) {
    return Response.json({ ok: false, error: 'Shopify order id or number is required' }, { status: 400 });
  }

  let order = null;
  let source = 'manual';
  let shopifyError = null;
  const fetched = await fetchShopifyOrder({ orderRef: String(orderRef) });
  if (fetched.order) {
    order = fetched.order;
    source = 'shopify';
  } else {
    shopifyError = fetched.error || null;
    order = orderFromAdminFields(body);
    if (!order.line_items?.length) {
      const hint = shopifyError === 'shopify_not_configured'
        ? 'Shopify Admin API is not configured. Pass product_title (or line_items) so the course can be provisioned from the fields you have.'
        : 'Could not load that order from Shopify. Pass product_title (or line_items), plus the buyer name and phone if you have them.';
      return Response.json({ ok: false, error: hint, shopify_error: shopifyError }, { status: 404 });
    }
  }

  try {
    const result = await provisionAdminCourseOrder({ supabase, order, email });
    if (!result.ok && result.error) {
      return Response.json({ ...result, source }, { status: 400 });
    }
    if (!result.detailer?.id && !result.app_access?.email) {
      return Response.json({
        ...result,
        ok: false,
        source,
        error: 'Nothing was provisioned. The order does not look like a course, or the database write failed. Check the order line items.',
      }, { status: 422 });
    }
    return Response.json({ ...result, source, shopify_error: source === 'manual' ? shopifyError : null });
  } catch (e) {
    console.error('[course-provision] failed:', e?.message || e);
    return Response.json({ ok: false, error: 'Provisioning failed', detail: e?.message || String(e) }, { status: 500 });
  }
}
