// Shiny Jets Aircraft Pricing Tool (pricing.shinyjets.com) access grants.
//
// Pure helpers only (no Supabase / Next imports) so they can be unit-tested
// with plain node: `node scripts/test-pricing-tool-access.mjs`.
//
// Shopify SKUs → app_access.product_type + days of access per unit.
export const PRICING_SKUS = {
  'PRICING-MONTHLY': { productType: 'monthly', days: 30 },
  'PRICING-QUARTERLY': { productType: 'quarterly', days: 90 },
};

const PRICING_TYPES = new Set(['monthly', 'quarterly']);
const DAY_MS = 24 * 60 * 60 * 1000;

export function isPricingSku(sku) {
  return String(sku || '').toUpperCase().trim().startsWith('PRICING-');
}

// Sum access days across all Pricing Tool line items on one order.
// Quantity is honored (2 × monthly = 60 days). If an order somehow mixes
// variants, the longer variant decides the product_type label.
// Returns null when the order has no Pricing Tool items.
export function pricingPurchaseFromLineItems(lineItems) {
  let days = 0;
  let productType = null;
  let longest = 0;
  const skus = [];
  for (const item of lineItems || []) {
    const sku = String(item?.sku || '').toUpperCase().trim();
    const def = PRICING_SKUS[sku];
    if (!def) continue;
    const qty = Math.max(1, parseInt(item?.quantity, 10) || 1);
    days += def.days * qty;
    skus.push(sku);
    if (def.days > longest) {
      longest = def.days;
      productType = def.productType;
    }
  }
  if (!days) return null;
  return { days, productType, skus };
}

// Second idempotency guard (the first is the webhook_logs grant record).
// If the email's row is already a Pricing Tool row stamped with this exact
// Shopify order id, this order was already applied — e.g. the grant log insert
// failed after the upsert, then Shopify retried. Only Pricing Tool rows count:
// the course handler also stamps shopify_order_id with the same order id when
// a cart mixes a course and a Pricing Tool SKU.
export function orderAlreadyApplied(existing, orderId) {
  if (!existing || !orderId) return false;
  if (!PRICING_TYPES.has(existing.product_type)) return false;
  return String(existing.shopify_order_id || '') === String(orderId);
}

function isCovering(row, now) {
  if (!row || row.status !== 'active' || !row.access_end) return false;
  return new Date(row.access_end).getTime() > now.getTime();
}

// Decide what to write to app_access for a Pricing Tool purchase.
//
// access_end = later(now, current access_end) + days — renewals stack,
// they never reset.
//
// One row per email, so rows that belong to another product are protected:
// if the existing row is a non-Pricing product (crm_free, crm_pro, course
// annuals, legacy_free_90, annual, …) AND it is currently covering today,
// we keep its product_type, shopify_order_id and access_start untouched and
// only push access_end out. That keeps CRM/course entitlements intact (the
// signup route grants CRM Enterprise off course product_types, and the CRM
// side owns crm_* rows and their order ids). A lapsed non-Pricing row is
// taken over as a normal Pricing Tool row.
//
// Returns { mode, row } where row is the full object to upsert.
export function computePricingGrant({ existing, email, orderId, productType, days, now = new Date() }) {
  const nowISO = now.toISOString();
  const base = existing?.access_end && new Date(existing.access_end).getTime() > now.getTime()
    ? new Date(existing.access_end)
    : now;
  const accessEnd = new Date(base.getTime() + days * DAY_MS).toISOString();

  const existingType = existing?.product_type || null;
  const covering = isCovering(existing, now);
  const foreignType = existingType && !PRICING_TYPES.has(existingType);

  if (existing && foreignType && covering) {
    return {
      mode: 'extend_preserve_type',
      row: {
        email,
        product_type: existingType,
        shopify_order_id: existing.shopify_order_id ?? null,
        access_start: existing.access_start || nowISO,
        access_end: accessEnd,
        status: 'active',
        updated_at: nowISO,
      },
    };
  }

  return {
    mode: existing ? (covering ? 'renew' : 'reactivate') : 'create',
    row: {
      email,
      product_type: productType,
      shopify_order_id: String(orderId),
      access_start: covering && existing?.access_start ? existing.access_start : nowISO,
      access_end: accessEnd,
      status: 'active',
      updated_at: nowISO,
    },
  };
}

export function pricingToolAccessEmail({ email, firstName, accessEnd, productType }) {
  const endStr = new Date(accessEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const planLabel = productType === 'quarterly' ? 'quarterly' : productType === 'monthly' ? 'monthly' : '';
  const planLine = planLabel
    ? `Thanks for your ${planLabel} subscription to the <strong>Shiny Jets Aircraft Pricing Tool</strong>.`
    : 'Thanks for purchasing the <strong>Shiny Jets Aircraft Pricing Tool</strong>.';
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#f9f9f9;">
      <div style="background:#fff;padding:32px;border-radius:12px;border:1px solid #e5e5e5;">
        <h1 style="color:#007CB1;margin:0 0 8px;font-size:24px;">You're in, ${firstName}!</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#555;">${planLine} You now have full access to instant detailing quotes for 200+ aircraft.</p>
        <div style="background:#f0f7fb;border:1px solid #cfe4f0;border-radius:8px;padding:18px 20px;margin:20px 0;">
          <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Go to</p>
          <p style="margin:0 0 16px;"><a href="https://pricing.shinyjets.com" style="color:#007CB1;font-weight:600;text-decoration:none;">pricing.shinyjets.com</a></p>
          <p style="margin:0 0 8px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.05em;">Sign in with</p>
          <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#1a1a1a;">${email}</p>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="https://pricing.shinyjets.com" style="display:inline-block;padding:14px 32px;background:#007CB1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Open the Pricing Tool</a>
        </div>
        <p style="font-size:13px;color:#666;line-height:1.6;margin:24px 0 0;">Sign in with the same email address you used at checkout. Your access is active through <strong>${endStr}</strong> and extends automatically each time your subscription renews. Need help? Reply to this email.</p>
        <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
        <p style="font-size:11px;color:#999;margin:0;text-align:center;">Shiny Jets &middot; <a href="https://pricing.shinyjets.com" style="color:#999;">pricing.shinyjets.com</a></p>
      </div>
    </body></html>`;
  const text = `Hi ${firstName},

${planLabel ? `Thanks for your ${planLabel} subscription to the Shiny Jets Aircraft Pricing Tool.` : 'Thanks for purchasing the Shiny Jets Aircraft Pricing Tool.'}

Go to: https://pricing.shinyjets.com
Sign in with the email you used at checkout: ${email}

Your access is active through ${endStr} and extends automatically each time your subscription renews.

Need help? Reply to this email.

— Shiny Jets`;
  return { html, text };
}
