# Shiny Jets CRM — Shopify Product Listings (Free / Lite / Business)

Product copy for the three CRM plans. Paste into Shopify, or run
`scripts/update-shopify-products.js` (dry-run by default; `--apply` writes to the store).

| Plan | Price | SKU | Term granted per unit | Existing product / handle |
|------|-------|-----|-----------------------|---------------------------|
| Free | $0 | `SJ-CRM-FREE` | — (never downgrades a paid account) | Free Starter product |
| Lite | $39.95 / month | `SJ-CRM-LITE` | 30 days | former **Pro** product (`aircraft-detailing-crm-pro`) |
| Business | $89.95 / month | `SJ-CRM-BUSINESS` | 30 days | Business product (`aircraft-detailing-crm-business`) |
| Business (Annual) | $899 / year | `SJ-CRM-BUSINESS-YEARLY` | 365 days | former **Enterprise** product (`aircraft-detailing-crm-enterprise`) |

Legacy SKUs keep working in the CRM webhook: `SJ-CRM-PRO` → Lite (30 days), `SJ-CRM-ENTERPRISE` → Business
(365 days when sold at $800+, otherwise 30 days).

**Pricing Tool bundle:** paid `PRICING-QUARTERLY` orders also grant **CRM Lite for 90 days per unit** (stacked onto any
remaining time; never downgrades a Business account). `PRICING-MONTHLY` does **not** include Lite.
**Business includes Pricing Tool access** for the paid term.

Platform fee on online payments collected through the CRM: **Free 5% · Lite 2% · Business 0%**.

> Important for buyers: purchase with the same email address as the CRM account so the plan activates automatically.

---

# PRODUCT 1 — FREE ($0)

## Shopify Settings

| Field | Value |
|-------|-------|
| **Title** | Shiny Jets CRM — Free |
| **Price** | $0.00 |
| **SKU** | SJ-CRM-FREE |
| **Product Type** | Digital / Subscription |
| **Vendor** | Shiny Jets |
| **Meta Title** | Shiny Jets CRM Free \| Aircraft Detailing Quoting Software |
| **Meta Description** | Free aircraft detailing CRM: 5 sent quotes a month, customer and aircraft history, FAA tail lookup, PDF quotes and share links, and a public request link. |

## Short Description
```
Start quoting aircraft detailing jobs today — free forever. 5 sent quotes a month, customers and aircraft history, FAA tail lookup, PDF quotes and a public request link.
```

## Full HTML Product Description
```html
<h2>Start Quoting Aircraft Detailing Jobs Today</h2>
<p>Shiny Jets CRM Free gives you a professional quote builder built for aircraft detailers — no credit card required.</p>
<h3>What's Included in Free</h3>
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
</ul>
<p style="text-align:center;margin-top:2em;"><a href="https://crm.shinyjets.com/signup" style="display:inline-block;background-color:#007CB1;color:#ffffff;padding:16px 40px;text-decoration:none;font-weight:600;border-radius:4px;">Start Free at crm.shinyjets.com</a></p>
```

---

# PRODUCT 2 — LITE ($39.95/mo)

## Shopify Settings

| Field | Value |
|-------|-------|
| **Title** | Shiny Jets CRM — Lite |
| **Handle/URL** | keep existing `aircraft-detailing-crm-pro` (links in the CRM point here) |
| **Price** | $39.95 / month |
| **SKU** | SJ-CRM-LITE |
| **Product Type** | Digital / Subscription |
| **Vendor** | Shiny Jets |
| **Meta Title** | Shiny Jets CRM Lite \| Aircraft Detailing CRM \| $39.95/mo |
| **Meta Description** | Unlimited quotes, follow-ups, Google Calendar sync, invoices and online payments, jobs with photos and customer portal — for solo aircraft detailers. |

## Short Description
```
Everything a solo aircraft detailer needs to quote, book, invoice and get paid: unlimited quotes, follow-ups, Google Calendar sync, invoices with deposits, jobs with photos and customer portal.
```

## Full HTML Product Description
```html
<h2>Run Your Solo Detailing Business From One Place</h2>
<p>Shiny Jets CRM Lite takes you from quote to paid invoice without spreadsheets. Build quotes in seconds, follow up automatically, schedule on your Google Calendar and collect payments online.</p>
<h3>Everything in Free, plus:</h3>
<ul>
  <li>Unlimited quotes</li>
  <li>Quote follow-ups + scheduled sending</li>
  <li>Google Calendar sync</li>
  <li>Invoices + Stripe payments, deposits and Book Now, Pay Later</li>
  <li>Jobs with photos + completion and delivery reports</li>
  <li>Customer portal + live aircraft progress portal</li>
  <li>Review and feedback requests</li>
  <li>Your own logo on quotes (with "Powered by Shiny Jets")</li>
  <li>1 user</li>
  <li>2% platform fee on online payments (vs 5% on Free)</li>
</ul>
<p><strong>Pricing Tool subscribers:</strong> Lite is included at no extra cost with a quarterly Pricing Tool subscription.</p>
<h3>Frequently Asked Questions</h3>
<details><summary><strong>How do I activate Lite?</strong></summary><p>Buy with the same email as your CRM account (or create one at crm.shinyjets.com). Your plan upgrades automatically; each monthly renewal adds 30 days.</p></details>
<details><summary><strong>Can I cancel anytime?</strong></summary><p>Yes. No contracts. If you cancel, Lite stays active until the end of the period you paid for, then your account returns to Free. Your data is kept.</p></details>
<details><summary><strong>What if I need a team?</strong></summary><p>Upgrade to Business for up to 3 users, the crew app, time clock, dispatch and more.</p></details>
```

---

# PRODUCT 3 — BUSINESS ($89.95/mo or $899/yr)

## Shopify Settings

| Field | Monthly | Annual |
|-------|---------|--------|
| **Title** | Shiny Jets CRM — Business | Shiny Jets CRM — Business (Annual) |
| **Handle/URL** | keep `aircraft-detailing-crm-business` | keep `aircraft-detailing-crm-enterprise` (repurposed) |
| **Price** | $89.95 / month | $899 / year |
| **SKU** | SJ-CRM-BUSINESS | SJ-CRM-BUSINESS-YEARLY |
| **Product Type** | Digital / Subscription | Digital / Subscription |
| **Meta Title** | Shiny Jets CRM Business \| Aircraft Detailing Team Software | same |
| **Meta Description** | Detailing AI, crew app, PIN time clock, payroll, dispatch, change orders, reports, inventory, full white-label and 0% platform fee — plus Pricing Tool access. | same |

## Short Description
```
For detailing operations running a crew: Detailing AI, up to 3 users, crew app, PIN time clock and payroll, dispatch, change orders, reports, inventory, full white-label and 0% platform fee. Pricing Tool access included.
```

## Full HTML Product Description
```html
<h2>Scale Your Aircraft Detailing Operation Without the Chaos</h2>
<p>Shiny Jets CRM Business adds everything you need to run a crew — and includes the Shiny Jets Pricing Tool.</p>
<h3>Everything in Lite, plus:</h3>
<ul>
  <li>Detailing AI + AI quote drafts</li>
  <li>Pricing Tool access included</li>
  <li>Up to 3 users (you + 2 team members) with roles &amp; permissions</li>
  <li>Crew app, PIN time clock and payroll</li>
  <li>Dispatch board + manager dashboard</li>
  <li>Change orders</li>
  <li>Reports &amp; profitability</li>
  <li>Recurring services</li>
  <li>Marketing campaigns</li>
  <li>Products, inventory &amp; barcode scanning, equipment tracking</li>
  <li>Full white-label (your brand only) + custom sending domain</li>
  <li>Top directory placement</li>
  <li>0% platform fee on online payments</li>
</ul>
<h3>Frequently Asked Questions</h3>
<details><summary><strong>How many users are included?</strong></summary><p>Up to 3 users in total — the account owner plus 2 active team members.</p></details>
<details><summary><strong>Monthly or annual?</strong></summary><p>$89.95 per month, or $899 per year (about 2 months free). Each monthly payment adds 30 days; each annual payment adds 365 days.</p></details>
<details><summary><strong>Is the Pricing Tool really included?</strong></summary><p>Yes. Business subscribers get Pricing Tool access for as long as the Business term is active.</p></details>
<details><summary><strong>Can I cancel anytime?</strong></summary><p>Yes. Business stays active through the period you paid for, then the account returns to Free. Your data is kept.</p></details>
```

---

# COURSE / TRAINING TAGS (CRM Business auto-provision)

Any paid product tagged **`course`** or **`training`** grants **CRM Business free for 1 year** on `orders/paid`
(previously called "Enterprise"; existing course grants are treated as Business with the same end date).

| Tag | Effect |
|-----|--------|
| `course` | Business for 1 year + login email from sales@ |
| `training` | Same |
| `masterclass` / `certification` / `crm-enterprise-bundle` | Also accepted |

**Do not** put these tags on CRM subscription SKUs (`SJ-CRM-*`) or merch.

---

# SHOPIFY TAGS (All Products)

```
aircraft detailing software, aviation CRM, aircraft detailing business, quote builder aircraft, aviation detailing tools, aircraft detailer software, FBO detailing, private jet detailing software, aircraft cleaning business software, aviation business management, aircraft wash quoting, ceramic coating aircraft, aircraft detailing pricing, detailing business management, aircraft maintenance software, aviation service platform, jet detailing CRM, helicopter detailing software, aircraft appearance management, detailing crew management
```

---

# GOOGLE SHOPPING SCHEMA (JSON-LD)

Add to the Shopify theme `<head>` or use a schema app. (Do not add review/rating markup unless it reflects real reviews.)

```json
[
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Shiny Jets CRM Lite",
    "description": "Aircraft detailing CRM for solo detailers: unlimited quotes, follow-ups, Google Calendar sync, invoices and online payments, jobs with photos and customer portal.",
    "url": "https://shinyjets.com/products/aircraft-detailing-crm-pro",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "offers": { "@type": "Offer", "price": "39.95", "priceCurrency": "USD", "availability": "https://schema.org/InStock" }
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Shiny Jets CRM Business",
    "description": "Aircraft detailing team software: up to 3 users, crew app, time clock, payroll, dispatch, change orders, reports, inventory, full white-label, 0% platform fee and Pricing Tool access.",
    "url": "https://shinyjets.com/products/aircraft-detailing-crm-business",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "offers": [
      { "@type": "Offer", "price": "89.95", "priceCurrency": "USD", "availability": "https://schema.org/InStock" },
      { "@type": "Offer", "price": "899.00", "priceCurrency": "USD", "availability": "https://schema.org/InStock", "url": "https://shinyjets.com/products/aircraft-detailing-crm-enterprise" }
    ]
  }
]
```

## FAQ Schema (All Products)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How much does Shiny Jets CRM cost?",
      "acceptedAnswer": { "@type": "Answer", "text": "Free is $0 with 5 sent quotes per month and a 5% platform fee. Lite is $39.95/month with unlimited quotes, invoices, jobs, follow-ups and a 2% fee. Business is $89.95/month or $899/year with up to 3 users, crew tools, reports, white-label, Pricing Tool access and a 0% fee." }
    },
    {
      "@type": "Question",
      "name": "Is there a free plan for aircraft detailing software?",
      "acceptedAnswer": { "@type": "Answer", "text": "Yes. Shiny Jets CRM Free includes 5 sent quotes per month, customers and aircraft history, FAA tail lookup, PDF quotes with share links and a public request link. No credit card required." }
    },
    {
      "@type": "Question",
      "name": "Can I manage my aircraft detailing crew with this software?",
      "acceptedAnswer": { "@type": "Answer", "text": "Yes, on Business: up to 3 users with roles and permissions, a crew app, PIN time clock, payroll, dispatch board and change orders." }
    },
    {
      "@type": "Question",
      "name": "Can I white-label the software with my own branding?",
      "acceptedAnswer": { "@type": "Answer", "text": "Lite shows your logo with a small Powered by Shiny Jets note. Business is fully white-label and can send email from your own domain." }
    }
  ]
}
```

---

# SEO BLOG POST IDEAS

Target these keywords with content marketing on the Shiny Jets blog:

| # | Title | Target Keyword |
|---|-------|----------------|
| 1 | How to Price Aircraft Detailing Jobs in 2026 (Complete Guide) | aircraft detailing pricing |
| 2 | Aircraft Detailing Business Software: What to Look For | aircraft detailing software |
| 3 | How Much Does It Cost to Detail a Private Jet? | cost to detail private jet |
| 4 | Starting an Aircraft Detailing Business: The Complete 2026 Guide | start aircraft detailing business |
| 5 | Aircraft Detailing Hourly Rates by Region (2026 Data) | aircraft detailing hourly rate |
| 6 | Best CRM for Aircraft Detailers: Features That Actually Matter | CRM for aircraft detailers |
| 7 | How to Get Aircraft Detailing Contracts at FBOs | aircraft detailing FBO contracts |
| 8 | Ceramic Coating for Aircraft: Pricing, Process, and Profit Margins | ceramic coating aircraft |
| 9 | Aircraft Detailing Business Plan Template (Free Download) | aircraft detailing business plan |
| 10 | How to Hire and Manage an Aircraft Detailing Crew | manage aircraft detailing crew |
| 11 | Aircraft Detailing Insurance: What Coverage Do You Need? | aircraft detailing insurance |
| 12 | Interior vs Exterior Aircraft Detailing: Which Is More Profitable? | aircraft detailing profit |
| 13 | How to Quote a Boeing BBJ Detail (Step-by-Step) | quote boeing bbj detail |
| 14 | Aircraft Detailing Equipment List: What You Actually Need | aircraft detailing equipment |
| 15 | Warbird Detailing: How to Price and Service Vintage Aircraft | warbird detailing |
