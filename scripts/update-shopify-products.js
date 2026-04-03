#!/usr/bin/env node
/**
 * Update Shiny Jets CRM Shopify products.
 * Run: SHOPIFY_ACCESS_TOKEN=shpat_xxx node scripts/update-shopify-products.js
 */

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL || 'https://619shinyjets.myshopify.com';
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('Missing SHOPIFY_ACCESS_TOKEN env var');
  console.error('Get it from: Shopify Admin → Settings → Apps → Develop apps → Create app → Admin API');
  process.exit(1);
}

const STORE_DOMAIN = SHOPIFY_STORE.replace('https://', '').replace('http://', '');
const API_URL = `https://${STORE_DOMAIN}/admin/api/2024-01/graphql.json`;

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) {
    console.error('GraphQL errors:', JSON.stringify(data.errors, null, 2));
  }
  return data;
}

const PRODUCTS = [
  {
    id: 'gid://shopify/Product/8175564488889',
    title: 'Shiny Jets CRM — Free Starter',
    tags: ['crm-subscription', 'shiny-jets-crm'],
    descriptionHtml: `<p>The fastest way to start quoting aircraft detailing jobs. Free forever. No credit card required.</p>
<p><strong>Includes:</strong></p>
<ul>
<li>5 quotes per month</li>
<li>FAA tail number autofill</li>
<li>300+ aircraft hours database</li>
<li>Customer quote portal</li>
<li>Before/after photo uploads</li>
<li>Directory listing</li>
<li>1 user</li>
</ul>`,
    variants: [{ sku: 'SJ-CRM-FREE', price: '0.00' }],
  },
  {
    id: 'gid://shopify/Product/8363801084089',
    title: 'Shiny Jets CRM — Pro',
    tags: ['crm-subscription', 'shiny-jets-crm'],
    descriptionHtml: `<p>Built for the solo aircraft detailer ready to run a professional operation. Send quotes, take payments, track jobs, and build customer relationships — all in one place.</p>
<p><strong>Includes everything in Free, plus:</strong></p>
<ul>
<li>Unlimited quotes</li>
<li>Stripe online payments</li>
<li>Google Calendar sync + auto-scheduling</li>
<li>Automated review requests (7 days post-job)</li>
<li>Customer accounts with job history + photo portal</li>
<li>Recurring service tracking dashboard</li>
<li>Directory listing with Online Booking badge</li>
<li>1 user</li>
</ul>`,
    variants: [{ sku: 'SJ-CRM-PRO', price: '79.00' }],
  },
  {
    create: true,
    title: 'Shiny Jets CRM — Business',
    status: 'DRAFT',
    tags: ['crm-subscription', 'shiny-jets-crm'],
    descriptionHtml: `<p>For detailing operations running a crew. Dispatch jobs, manage your team, and never let a recurring service fall through the cracks.</p>
<p><strong>Includes everything in Pro, plus:</strong></p>
<ul>
<li>Up to 5 team members</li>
<li>Dispatch module</li>
<li>Recurring service reminders sent to customers</li>
<li>Team job assignment and tracking</li>
<li>Priority directory placement</li>
</ul>`,
    variants: [{ sku: 'SJ-CRM-BUSINESS', price: '149.00' }],
  },
  {
    create: true, // Will update if found by title
    title: 'Shiny Jets CRM — Enterprise',
    status: 'DRAFT',
    tags: ['crm-subscription', 'shiny-jets-crm'],
    descriptionHtml: `<p>For FBOs, flight departments, and detailing companies that need full control, custom branding, and unlimited scale.</p>
<p><strong>Includes everything in Business, plus:</strong></p>
<ul>
<li>Unlimited team members</li>
<li>White label branding (your logo, your colors)</li>
<li>Custom intake questions per job type</li>
<li>FlightAware API integration — automatic flight hour tracking per aircraft</li>
<li>Fuel receipt upload portal (pilot or aircraft owner submits receipts via their customer account)</li>
<li>Pre/post ceramic coating fuel burn comparison</li>
<li>Automated ROI reporting for aircraft owners</li>
<li>Anomaly detection on fuel burn data</li>
<li>Priority support</li>
<li>Dedicated onboarding</li>
</ul>`,
    variants: [{ sku: 'SJ-CRM-ENTERPRISE', price: '899.00' }],
  },
];

async function updateProduct(product) {
  if (product.id && !product.create) {
    // Update existing
    const mutation = `mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title status tags }
        userErrors { field message }
      }
    }`;
    const input = {
      id: product.id,
      title: product.title,
      descriptionHtml: product.descriptionHtml,
      tags: product.tags,
    };
    const result = await shopifyGraphQL(mutation, { input });
    const errors = result.data?.productUpdate?.userErrors;
    if (errors?.length) {
      console.error(`  ERRORS for ${product.title}:`, errors);
    } else {
      console.log(`  Updated: ${product.title} → ${result.data?.productUpdate?.product?.id}`);
    }
    return result.data?.productUpdate?.product;
  } else {
    // Create new
    const mutation = `mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id title status tags }
        userErrors { field message }
      }
    }`;
    const input = {
      title: product.title,
      descriptionHtml: product.descriptionHtml,
      tags: product.tags,
      status: product.status || 'DRAFT',
    };
    const result = await shopifyGraphQL(mutation, { input });
    const errors = result.data?.productCreate?.userErrors;
    if (errors?.length) {
      console.error(`  ERRORS for ${product.title}:`, errors);
    } else {
      console.log(`  Created: ${product.title} → ${result.data?.productCreate?.product?.id}`);
    }
    return result.data?.productCreate?.product;
  }
}

async function main() {
  console.log('Updating Shiny Jets CRM Shopify products...\n');

  for (const product of PRODUCTS) {
    await updateProduct(product);
  }

  console.log('\nDone. All products updated/created in DRAFT status.');
  console.log('Verify at: https://shinyjets.com/admin/products');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
