#!/usr/bin/env node
/**
 * Update the Shiny Jets CRM subscription products in Shopify to the
 * three-tier structure (Free / Lite / Business).
 *
 * DRY RUN BY DEFAULT — prints what would change and exits.
 * To actually write to the store you must pass --apply:
 *
 *   SHOPIFY_ACCESS_TOKEN=shpat_xxx SHOPIFY_STORE_URL=shinyjets.myshopify.com \
 *     node scripts/update-shopify-products.js --apply
 *
 * Credentials are read from the environment only (never hard-code secrets).
 *
 * Product mapping (existing handles are kept so current links keep working):
 *   - Free      → existing "Free Starter" product      SKU SJ-CRM-FREE          $0
 *   - Lite      → existing "Pro" product (renamed)      SKU SJ-CRM-LITE          $39.95 / month
 *   - Business  → existing "Business" product           SKU SJ-CRM-BUSINESS      $89.95 / month
 *   - Business (Annual) → existing "Enterprise" product SKU SJ-CRM-BUSINESS-YEARLY $899 / year
 *
 * The CRM webhook still accepts the legacy SKUs SJ-CRM-PRO (→ Lite) and
 * SJ-CRM-ENTERPRISE (→ Business), so existing subscriptions keep working
 * until their contracts renew on the new SKUs.
 *
 * Subscription frequency (monthly / yearly) is configured in the
 * subscriptions app (Seal), not by this script.
 */

const APPLY = process.argv.includes('--apply');
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL || 'shinyjets.myshopify.com';
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const STORE_DOMAIN = SHOPIFY_STORE.replace('https://', '').replace('http://', '').replace(/\/$/, '');
const API_URL = `https://${STORE_DOMAIN}/admin/api/2025-01/graphql.json`;

const TAGS = ['crm-subscription', 'shiny-jets-crm'];

const PRODUCTS = [
  {
    key: 'free',
    id: 'gid://shopify/Product/8175564488889',
    title: 'Shiny Jets CRM — Free',
    sku: 'SJ-CRM-FREE',
    price: '0.00',
    descriptionHtml: `<p>Start quoting aircraft detailing jobs today. Free forever — no credit card required.</p>
<p><strong>Includes:</strong></p>
<ul>
<li>5 sent quotes per month</li>
<li>Customers + aircraft service history</li>
<li>FAA tail-number lookup</li>
<li>Quote builder with PDF + share link</li>
<li>Public request link, QR code &amp; website embed + Requests inbox</li>
<li>Public directory listing</li>
<li>1 user</li>
<li>Shiny Jets branding on customer-facing pages</li>
<li>5% platform fee on online payments</li>
</ul>`,
  },
  {
    key: 'lite',
    id: 'gid://shopify/Product/8363801084089', // formerly "Shiny Jets CRM — Pro"
    title: 'Shiny Jets CRM — Lite',
    sku: 'SJ-CRM-LITE',
    price: '39.95',
    descriptionHtml: `<p>Everything a solo aircraft detailer needs to quote, book, invoice and get paid — for $39.95/month.</p>
<p><strong>Everything in Free, plus:</strong></p>
<ul>
<li>Unlimited quotes</li>
<li>Quote follow-ups + scheduled sending</li>
<li>Google Calendar sync</li>
<li>Invoices + Stripe payments, deposits and Book Now, Pay Later</li>
<li>Jobs with photos + completion and delivery reports</li>
<li>Customer portal + live aircraft progress portal</li>
<li>Detailing AI + AI quote drafts</li>
<li>Review and feedback requests</li>
<li>Your own logo on quotes (with "Powered by Shiny Jets")</li>
<li>1 user</li>
<li>2% platform fee on online payments</li>
</ul>
<p>Lite is included at no extra cost with a quarterly Pricing Tool subscription.</p>
<p>Use the same email address as your CRM account so your plan activates automatically. Each monthly renewal adds 30 days.</p>`,
  },
  {
    key: 'business',
    title: 'Shiny Jets CRM — Business',
    findByTitle: ['Shiny Jets CRM — Business', 'Shiny Jets CRM Business'],
    sku: 'SJ-CRM-BUSINESS',
    price: '89.95',
    descriptionHtml: BUSINESS_HTML('$89.95/month', 'Each monthly renewal adds 30 days.'),
  },
  {
    key: 'business_yearly',
    title: 'Shiny Jets CRM — Business (Annual)',
    findByTitle: ['Shiny Jets CRM — Enterprise', 'Shiny Jets CRM Enterprise', 'Shiny Jets CRM — Business (Annual)'],
    sku: 'SJ-CRM-BUSINESS-YEARLY',
    price: '899.00',
    descriptionHtml: BUSINESS_HTML('$899/year', 'Each annual payment adds 365 days.'),
  },
];

function BUSINESS_HTML(priceLabel, termNote) {
  return `<p>For detailing operations running a crew — ${priceLabel}.</p>
<p><strong>Everything in Lite, plus:</strong></p>
<ul>
<li>Pricing Tool access included</li>
<li>Up to 3 users (you + 2 team members) with roles &amp; permissions</li>
<li>Crew app, PIN time clock and payroll</li>
<li>Dispatch board + manager dashboard</li>
<li>Change orders</li>
<li>Reports &amp; profitability</li>
<li>Recurring services</li>
<li>Marketing campaigns</li>
<li>Products, inventory &amp; barcode scanning, equipment tracking</li>
<li>Full white-label + custom sending domain</li>
<li>Top directory placement</li>
<li>0% platform fee on online payments</li>
</ul>
<p>Use the same email address as your CRM account so your plan activates automatically. ${termNote}</p>`;
}

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) console.error('GraphQL errors:', JSON.stringify(data.errors, null, 2));
  return data;
}

async function findProductId(product) {
  if (product.id) return product.id;
  for (const title of product.findByTitle || []) {
    const q = `query($q: String!) { products(first: 5, query: $q) { nodes { id title handle } } }`;
    const r = await shopifyGraphQL(q, { q: `title:'${title.replace(/'/g, "\\'")}'` });
    const hit = r.data?.products?.nodes?.find((n) => n.title === title);
    if (hit) return hit.id;
  }
  return null;
}

async function getVariants(productId) {
  const q = `query($id: ID!) { product(id: $id) { id title handle variants(first: 10) { nodes { id sku price } } } }`;
  const r = await shopifyGraphQL(q, { id: productId });
  return r.data?.product || null;
}

async function applyProduct(product) {
  let productId = await findProductId(product);
  if (!productId) {
    const r = await shopifyGraphQL(
      `mutation($input: ProductInput!) { productCreate(input: $input) { product { id } userErrors { field message } } }`,
      { input: { title: product.title, descriptionHtml: product.descriptionHtml, tags: TAGS, status: 'DRAFT' } },
    );
    const errs = r.data?.productCreate?.userErrors;
    if (errs?.length) { console.error(`  ERRORS creating ${product.title}:`, errs); return; }
    productId = r.data?.productCreate?.product?.id;
    console.log(`  Created (DRAFT): ${product.title} → ${productId}`);
  } else {
    const r = await shopifyGraphQL(
      `mutation($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }`,
      { input: { id: productId, title: product.title, descriptionHtml: product.descriptionHtml, tags: TAGS } },
    );
    const errs = r.data?.productUpdate?.userErrors;
    if (errs?.length) { console.error(`  ERRORS updating ${product.title}:`, errs); return; }
    console.log(`  Updated: ${product.title} → ${productId}`);
  }

  const info = await getVariants(productId);
  const variant = info?.variants?.nodes?.[0];
  if (!variant) { console.warn(`  No variant found on ${product.title}; set SKU ${product.sku} / $${product.price} manually.`); return; }
  const r = await shopifyGraphQL(
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id sku price } userErrors { field message } }
    }`,
    { productId, variants: [{ id: variant.id, price: product.price, inventoryItem: { sku: product.sku } }] },
  );
  const errs = r.data?.productVariantsBulkUpdate?.userErrors;
  if (errs?.length) console.error(`  ERRORS updating variant for ${product.title}:`, errs);
  else console.log(`  Variant: ${variant.sku || '(none)'} $${variant.price} → ${product.sku} $${product.price}`);
}

async function main() {
  console.log(`Shiny Jets CRM Shopify products — ${APPLY ? 'APPLY MODE (writes to the store)' : 'DRY RUN (no changes)'}\n`);
  for (const p of PRODUCTS) {
    console.log(`• ${p.title}  [${p.sku}  $${p.price}]  ${p.id ? `id=${p.id}` : `find by title: ${p.findByTitle.join(' | ')}`}`);
  }
  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply (and SHOPIFY_ACCESS_TOKEN set) to update the store.');
    return;
  }
  if (!TOKEN) {
    console.error('Missing SHOPIFY_ACCESS_TOKEN env var');
    process.exit(1);
  }
  console.log('');
  for (const p of PRODUCTS) await applyProduct(p);
  console.log('\nDone. Review at https://admin.shopify.com (new products are created as DRAFT).');
  console.log('Remember to configure monthly (Lite, Business) and yearly (Business Annual) plans in the subscriptions app.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
