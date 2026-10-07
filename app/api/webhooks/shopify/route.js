export const dynamic = 'force-dynamic';

// Implementation lives in lib/shopify-webhook-handlers.js so the admin
// course-provision route and tests can run the same orders/paid path.
export async function POST(request) {
  const { POST: handle } = await import('@/lib/shopify-webhook-handlers');
  return handle(request);
}
