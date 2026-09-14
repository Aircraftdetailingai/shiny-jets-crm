# Course → CRM Enterprise auto-provision (1 year)

**Status:** Spec + implementation on `feat/course-enterprise-comp`  
**Store:** Shopify `shinyjets` (sales@shinyjets.com)  
**CRM:** `https://crm.shinyjets.com`  
**Rule (Brett):** ANY course / training purchase → CRM **Enterprise** free for **1 year**, auto email login.  
**Do not:** email real customers from test tooling · break Victor (or any existing `comp_invite` / Enterprise preview).

---

## 1. Goal

When Shopify marks an order paid and the order contains a **course / training** product, Shiny Jets CRM must:

1. Detect the line item(s) as course/training (tags preferred; title/SKU/handle fallback).
2. **Create** a detailer (new email) **or upgrade** an existing detailer.
3. Set Victor-style entitlement fields for 12 months.
4. Email login (new accounts) or plan confirmation (existing) **from `sales@shinyjets.com`**.
5. Stay **idempotent** on Shopify retries (same `order_id` must not re-create passwords or double-email).

Pricing-app `app_access` for courses remains as today (separate from CRM Enterprise).

---

## 2. Webhook flow

```
Shopify orders/paid
        │
        ▼
POST /api/webhooks/shopify   (alias: /api/shopify/webhook)
        │
        ├─ HMAC verify via SHOPIFY_WEBHOOK_SECRET
        ├─ Log row → webhook_logs (source=shopify, topic, payload)
        │
        ├─ handleCoursePricingAccess()     // existing pricing.shinyjets.com grant
        │
        └─ handleOrderPaid()
              │
              ├─ resolve CRM SKU plan? (SJ-CRM-*) → paid Shopify path (unchanged)
              │
              └─ else / also: any course line item?
                    │
                    ├─ idempotency: if webhook_logs already has
                    │    topic=course_enterprise_granted for this order_id → skip CRM side
                    │
                    ├─ findDetailer(email | shopify_customer_id)
                    │
                    ├─ NEW detailer
                    │     insert plan=enterprise, status=active,
                    │     subscription_status=comped,
                    │     subscription_source=course_bundle,
                    │     trial_ends_at=+1y, plan_expires_at=+1y,
                    │     platform_fee_percent=0,
                    │     temp password + must_change_password=true
                    │     → email credentials (sales@) + optional plain-text follow-up
                    │
                    └─ EXISTING detailer
                          NEVER reset password
                          NEVER shorten trial_ends_at / plan_expires_at
                          NEVER downgrade enterprise / paid shopify
                          If plan in {free,pro,business}: upgrade to enterprise + comped fields
                          If already enterprise with longer/equal end: no-op entitlement, maybe skip email
                          → plan-change / “your year of Enterprise is active” email (sales@)
```

**Env vars (already used — do not invent secrets):**

| Variable | Purpose |
|----------|---------|
| `SHOPIFY_WEBHOOK_SECRET` | HMAC for inbound webhooks |
| `SHOPIFY_STORE_URL` | e.g. `shinyjets.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Admin API — fetch product **tags** when line_items lack them |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | detailers + logs |
| `RESEND_API_KEY` | send mail |
| `RESEND_FROM_EMAIL` | default platform From; course emails override to sales@ |
| `COURSE_PROVISION_FROM` *(optional)* | override; default `Shiny Jets <sales@shinyjets.com>` |
| `ADMIN_PHONE` | optional SMS alert |

If `SHOPIFY_WEBHOOK_SECRET` is missing in an environment, webhook returns 401 (existing behavior). Do not stub fake secrets.

---

## 3. SKU / product matching (“any course”)

Order `line_items` do **not** always include Shopify tags. Matching is layered:

### A. Preferred — Shopify product tags (Admin API)

For each line item `product_id`, if `SHOPIFY_ACCESS_TOKEN` + `SHOPIFY_STORE_URL` are set:

`GET /admin/api/2024-01/products/{id}.json` → `product.tags` (comma-separated).

**Trigger tags (case-insensitive, any one):**

- `course`
- `training`

Optional extras Brett may add (also accepted): `masterclass`, `certification`, `crm-enterprise-bundle`.

### B. Fallback — title / SKU / known handles (no Admin call)

Keywords (substring, lowercased):  
`course`, `masterclass`, `certification`, `training`, `5 day`, `5-day`, `dominate`, `immersive`

Known handles / title fragments:  
`aircraft-detailing-masterclass`, `online-aircraft-detailing-course`

### C. Explicit CRM subscription SKUs still win for *paid* plan sync

`SJ-CRM-FREE|PRO|BUSINESS|ENTERPRISE` continue to map to paid `subscription_source=shopify`.  
A cart that has **both** a CRM SKU and a course: apply paid CRM plan normally; course grant must **not** downgrade a paid Enterprise/Business; if paid plan is free/pro only, course still upgrades entitlement to Enterprise comp for 1y (see §5).

---

## 4. Detailer fields (Victor pattern + course analytics)

| Field | Value | Why |
|-------|--------|-----|
| `plan` | `enterprise` | Brett rule — course buyers get Enterprise (Detailing AI, 0% fee, white-label) |
| `subscription_status` | `comped` | Canonical comp status (also accepts legacy `complimentary` in redeem helper) |
| `subscription_source` | `course_bundle` | Distinguishes course auto-grant from admin Victor `comp_invite` previews |
| `trial_ends_at` | now + 1 year | Victor-visible end date |
| `plan_expires_at` | now + 1 year | Drives `/api/cron/plan-expirations` auto-downgrade to free |
| `platform_fee_percent` | `0` | Enterprise default |
| `plan_updated_at` | now | Audit |

**Victor / admin comps:** rows with `subscription_source=comp_invite` (or admin-staged Enterprise preview) must not be shortened or password-reset by course webhooks. Extend end dates only if the course grant is **later** than the current end.

---

## 5. Create vs upgrade rules

| Case | Action |
|------|--------|
| New email | Create detailer + temp password + credentials email |
| Existing free / pro / business | Upgrade to enterprise + stamp dates + confirmation email |
| Existing enterprise (paid shopify) | Keep plan; optionally extend `trial_ends_at`/`plan_expires_at` only if null; do not flip paid → `comped` |
| Existing enterprise + `comped`/`comp_invite` | Extend dates if course end is later; never reset password; skip credentials email |
| Suspended | Reactivate `status=active` when granting |

---

## 6. Email (credentials + copy)

**From:** `Shiny Jets <sales@shinyjets.com>` (requires Resend domain auth for `shinyjets.com` — already used for store).  
**Reply-To:** `sales@shinyjets.com` (or Brett).  
**Do not send** from test/admin simulate endpoints to production emails unless explicitly allow-listed.

### New account — subject
`Your Shiny Jets CRM Enterprise login (1 year included with your course)`

### Body must include
- Login URL `https://crm.shinyjets.com/login`
- Username (purchase email)
- Temporary password
- Enterprise for 12 months + **Detailing AI** (Insights → Detailing AI)
- End date (human-readable)
- Short “get started” steps

### Relevant extras (gamification / Fly Shiny)
Inside CRM, points on **Rewards** can redeem for:
- Free products
- Free CRM month extensions
- Fly Shiny product fulfillment (shop links at **https://flyshiny.com**)

Mention briefly in the welcome email so course buyers know Enterprise unlocks redeemable rewards — e.g. one line:  
*Earn points in CRM → redeem for free product packs, a free CRM month, and Fly Shiny gear at flyshiny.com (Rewards).*

### Existing account
No temp password. Confirm Enterprise year is active + login link + same Detailing AI / Rewards line.

### Template updates
- `compInviteTemplate` copy: Pro → **Enterprise** (admin-staged course comps).
- Plan-expiration cron courtesy email: mention included Enterprise year ending (not only Pro).

---

## 7. Idempotency

1. After a successful course Enterprise grant, insert `webhook_logs` with `topic: course_enterprise_granted` and `payload.order_id`.
2. At start of grant path, if such a row exists for `String(payload.id)`, **return early** (still 200 to Shopify).
3. Detailer create uses unique email; conflict → treat as existing upgrade path.
4. Never regenerate / re-email temp password for an existing `detailers` row.

---

## 8. Signup path alignment

`app/api/auth/signup/route.js` today upgrades course purchasers (via `app_access` masterclass) to **Pro**. Align to **Enterprise** + same Victor-style fields when active course `app_access` exists and plan is still free — so self-signup after course (if webhook missed create) still lands correctly. Comp invite redeem still wins over course auto-grant.

---

## 9. Safety

- No outbound mail from webhook **test** route to arbitrary customers.
- Do not modify Victor’s account in fixtures/scripts; production webhook only mutates the purchaser email on the order.
- Paid Shopify cancellations must not wipe `course_bundle` / `comped` Enterprise until `plan_expires_at` (existing cancel handler should skip or preserve comped course grants — implement guard).

---

## 10. How Brett tags products in Shopify (ops checklist)

So **any** course triggers without brittle title matching:

1. Open **Shopify Admin → Products → [course product]**.
2. In **Organization → Tags**, add (comma-separated is fine):
   - **`course`** (required for auto Enterprise)
   - **`training`** (also accepted; use for non-“course”-named training SKUs)
3. Optional clarity tags: `masterclass`, `certification`, `crm-enterprise-bundle`.
4. **Do not** put `course` / `training` on CRM subscription products (`SJ-CRM-*`) or merch — those would incorrectly grant Enterprise.
5. Save. New paid orders pick up tags via Admin API on webhook (token must stay valid).
6. Smoke-check: place a **$0 / test draft** only on a sandbox email, or use admin webhook test with a non-customer address — never Victor / real student emails.

**Current keyword fallback** still catches historical titles (e.g. “5 Day Aircraft Detailing Certification”, “Online Aircraft Detailing Course”) even if tags are missing.

---

## 11. Files touched (implementation)

| File | Change |
|------|--------|
| `app/api/webhooks/shopify/route.js` | Course → Enterprise grant, tags fetch, idempotency, sales@ mail, protect comps |
| `lib/email-templates.js` | Enterprise course welcome + update `compInviteTemplate` |
| `app/api/auth/signup/route.js` | Course `app_access` → Enterprise |
| `app/api/cron/plan-expirations/route.js` | Copy: included Enterprise year |
| `specs/course-enterprise-auto-provision.md` | Repo copy of this spec |

---

## 12. Acceptance checks

- [ ] Order with product tagged `course` → detailer enterprise / comped / course_bundle / trial+plan_expires +1y
- [ ] Duplicate `orders/paid` → no second credentials email
- [ ] Existing Pro buyer of course → Enterprise upgrade, password unchanged
- [ ] Existing `comp_invite` Enterprise with later `trial_ends_at` → not shortened
- [ ] CRM-only SKU order → no course grant
- [ ] Welcome email From sales@; mentions Detailing AI + Rewards / flyshiny.com
- [ ] Victor account untouched by this work
