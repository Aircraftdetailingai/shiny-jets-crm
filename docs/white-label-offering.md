# Shiny Jets — White-Label Sell Package

**Status:** Brett-locked commercial model (2026-09-13 PT)  
**Owner:** Brett / Shiny Jets  
**Canonical CRM:** `https://crm.shinyjets.com`  
**Public Detailing AI brand:** `https://aircraftdetailing.ai` (parking today — not CRM)  
**Repo:** `Aircraftdetailingai/shiny-jets-crm` (local folder: `/Users/brettberry/vector`)

> **Pricing note:** Dollar amounts below marked **EXAMPLE** are placeholders for Brett to edit. Do not publish as final without Brett sign-off. Use `TBD` in customer-facing quotes until locked.

---

## 0. Locked commercial model

**White-label CRM = one-time setup fee + yearly charge.**  
Not a pure monthly SaaS SKU for partner/white-label deals.

| Component | Model | EXAMPLE price (edit) |
|-----------|--------|----------------------|
| White-label CRM setup | One-time | **Setup $2,500 EXAMPLE** |
| White-label CRM access | Yearly | **Year $2,400 EXAMPLE** (~$200/mo equivalent) |
| Detailing AI add-on | Yearly (or included in Year package — Brett decide) | **Year $600 EXAMPLE** or **TBD** |
| aircraftdetailing.ai public | Marketing / lead-gen (not a partner SKU) | Free public preview |

**Prospect path (Victor / GECI style):**

1. Complimentary **Enterprise** preview account (comped).
2. Calibrated **catalog template** (seed services + calibration baseline).
3. **No live customers** on the preview — sandbox for quoting, branding, and AI only.
4. Convert → invoice setup + yearly; provision production (or flip the same row out of preview mode).

---

## 1. Offer tiers

### Tier A — CRM White-Label (primary sell)

**Who:** Independent / multi-location aircraft detailers who want their own brand on quotes, invoices, portals, and customer touchpoints.

**Includes:**

- Dedicated detailer row on Shiny Jets CRM (`crm.shinyjets.com`)
- **Enterprise** feature set (0% platform fee, white-label branding, API / custom email domain gates as shipped)
- Logo + theme branding (no “Powered by Shiny Jets” on customer surfaces)
- Quotes, jobs, invoices, crew, dispatch (per current Enterprise gates)
- In-CRM **Detailing AI** at `/detailing-ai` (staff auth; crew blocked)
- Calibrated service catalog template (see provisioning)
- Hosting on Shiny Jets multi-tenant CRM (custom domain later — see checklist)

**Commercial:**

| Fee | When | EXAMPLE |
|-----|------|---------|
| Setup | On signed SOW / kickoff | **$2,500 EXAMPLE** |
| Yearly | Anniversary / prepaid year | **$2,400 EXAMPLE** |

**Not included in base (unless sold):** custom domain cutover, on-prem, source-code license, exclusive territory rights, live customer migration from another CRM.

---

### Tier B — Detailing AI add-on

**Who:** Existing CRM shops (any paid plan) or white-label partners who want heavier AI usage / priority knowledge updates.

**Includes:**

- Access to Detailing AI (in-CRM chat) beyond fair-use defaults
- Priority updates to `knowledge/detailing/*` diagnostic packs
- Optional: higher AI token allotment (see Setup vs Yearly)

**Commercial:**

| Fee | EXAMPLE |
|-----|---------|
| Yearly add-on | **$600 EXAMPLE** or **TBD** |
| Or bundle into white-label Year | Brett: include AI allotment in Year fee |

Public marketing chat on `aircraftdetailing.ai` is **not** the partner SKU — it is lead-gen / brand.

---

### Tier C — aircraftdetailing.ai (public)

**What it is:** Public marketing + diagnostic chat site for the Detailing AI brand.

**What it is not:** Production CRM. CRM stays on `crm.shinyjets.com` only.

**Sell / CTA role:**

- Try Detailing AI (public chat)
- Course waitlist CTA
- CRM / white-label CTA → sales conversation (this doc)

**Current domain status:** GoDaddy **parking**, not CRM. See `docs` companion note in `/workspace/uploads/adai-domain-cutover.md`.

---

## 2. Provisioning checklist (new white-label / GECI-style preview)

Use this for Victor/GECI-style comps **and** paid white-label kickoffs.

### A. Create / upgrade detailer

- [ ] Confirm prospect email + company legal name
- [ ] **New detailer:** signup (or admin-create) → `detailers` row
- [ ] **Existing email:** admin upgrade in place via `POST /api/admin/comp-invites` **or** stage pending `comp_invites` row for first signup
- [ ] Set `plan = enterprise`
- [ ] Set `subscription_status = complimentary` (preview) or `active` (paid)
- [ ] Set `subscription_source = comp_invite` (preview) or billing source when paid
- [ ] Set `trial_ends_at` for comps (required for complimentary grants)
- [ ] Confirm `platform_fee_percent = 0` (Enterprise default)
- [ ] Confirm `is_admin = false` (partner is not Shiny Jets admin)

### B. Complimentary Enterprise preview rules (Victor/GECI path)

- [ ] Mark internally as **preview / no live customers**
- [ ] Do **not** import real customer lists into preview unless Brett approves
- [ ] Seed **calibrated catalog template** only (services + calibrations)
- [ ] Upload partner logo / theme in Settings → Branding (white-label surfaces)
- [ ] Walkthrough: quotes → jobs → delivery; Detailing AI at `/detailing-ai`
- [ ] Calendar / payments / SMS: optional — leave off until paid convert
- [ ] Document preview end date (`trial_ends_at`) and conversion ask

### C. Seed services + calibration template

- [ ] Copy / attach default detailing service catalog (exterior, acrylic, brightwork, ceramic, interior — align with Detailing AI knowledge packs)
- [ ] Apply **calibrated catalog template** (`service_calibrations` baseline — hours/pricing multipliers Brett’s template uses)
- [ ] Verify one sample quote on a known airframe (e.g. G550 / Citation) produces sane hours
- [ ] Partner may edit services; keep a note of “template vN” for support

### D. Branding & white-label surfaces

- [ ] Logo upload (`/api/user/branding/upload`)
- [ ] Theme colors / portal theme
- [ ] Confirm Business/Enterprise branding rules: detailer logo, **no** “Powered by” on customer PDFs/portals
- [ ] Company name, website URL, disclaimer text

### E. Detailing AI

- [ ] Confirm Anthropic (or OpenAI) key on **CRM** Vercel project for `/api/detailing-ai/chat`
- [ ] Staff login can open `/detailing-ai`; crew role remains blocked
- [ ] Optional: set AI token allotment / fair-use note for this partner (Year package)

### F. Custom domain (later — not day-one)

- [ ] Do **not** point partner apex at CRM project until dedicated tenant/domain work exists
- [ ] Day-one URL remains `https://crm.shinyjets.com` (partner logs in; branding carries their identity)
- [ ] Later: custom subdomain or domain (e.g. `crm.partner.com`) — separate eng ticket + DNS + WebAuthn / OAuth redirect review
- [ ] Never attach `aircraftdetailing.ai` to a partner tenant; that domain is the public Detailing AI brand

### G. Convert preview → paid white-label

- [ ] Invoice **Setup EXAMPLE $2,500** + **Year EXAMPLE $2,400** (edit)
- [ ] Flip `subscription_status` to `active`; clear or extend `trial_ends_at`
- [ ] Record setup paid date + year renewal date
- [ ] Enable live customers / Stripe Connect / GCal as needed
- [ ] Optional: Detailing AI add-on line item

---

## 3. What’s in Setup vs Yearly

### One-time setup (EXAMPLE $2,500)

| Included | Notes |
|----------|--------|
| Account provisioning | Detailer row, Enterprise plan, branding pass |
| Catalog template | Seed services + calibration baseline |
| Kickoff / onboarding call | Quote + AI walkthrough |
| Logo / theme apply | Partner assets |
| Internal runbook | This checklist completed |

| Not in setup (bill separately or later) | Notes |
|-----------------------------------------|--------|
| Custom domain | Later eng + DNS |
| Data migration from other CRM | Scoped SOW |
| On-site training days | Optional |
| Exclusive territory / franchise rights | Legal — out of product scope |

### Yearly charge (EXAMPLE $2,400/yr)

| Included | Notes |
|----------|--------|
| **Hosting** | Multi-tenant CRM on Shiny Jets infra (`crm.shinyjets.com`) |
| **Product updates** | Ongoing CRM features on Enterprise gates |
| **Support** | Reasonable email / async support (Brett define SLA) |
| **White-label branding** | Continued no-fee / no “Powered by” per Enterprise |
| **AI tokens (base allotment)** | Fair-use Detailing AI for staff; overage → add-on or top-up **TBD** |
| **Knowledge pack updates** | Periodic diagnostic markdown updates |

| Not automatically included | Notes |
|----------------------------|--------|
| Unlimited AI / heavy batch jobs | Detailing AI add-on or metered **TBD** |
| Custom engineering | Separate SOW |
| Shopify course seats | Separate product |

### Detailing AI tokens (policy stub)

- **Setup:** may include onboarding demo usage only.
- **Yearly:** includes a **base monthly token allotment** (EXAMPLE: enough for normal shop diagnosis volume — Brett set hard numbers).
- **Add-on / overage:** EXAMPLE **$600/yr** or metered; mark **TBD** until usage telemetry exists.
- Public `aircraftdetailing.ai` chat has its **own** API key / quota on the public Vercel project — do not mix with partner CRM allotments.

---

## 4. Sales one-pager copy (GECI-style prospects)

*Paste into email / PDF. Replace EXAMPLE prices before send.*

---

### Headline

**Your brand. Our aircraft-detailing CRM. Detailing AI included.**

### Subhead

Shiny Jets white-labels the same production CRM we run at `crm.shinyjets.com` — quotes, jobs, invoices, crew, and staff Detailing AI — under **your** logo. No “Powered by” on customer surfaces. Platform fee: **0%** on Enterprise white-label.

### The offer

1. **Complimentary Enterprise preview** — sandbox account, calibrated service catalog, **no live customers**. Learn the system on your branding.
2. **Go live** — one-time setup + prepaid year.
3. **Optional** — Detailing AI add-on for higher AI volume and priority diagnostic packs.
4. **Public brand** — owners and prospects can try Detailing AI at aircraftdetailing.ai; your shop stays on the CRM.

### Pricing (EXAMPLE — Brett edit before send)

| | |
|--|--|
| **Setup (one-time)** | **$2,500 EXAMPLE** |
| **Yearly white-label** | **$2,400 EXAMPLE** |
| **Detailing AI add-on** | **$600/yr EXAMPLE** or bundled |

### What’s in the preview (Victor/GECI path)

- Enterprise feature gates + white-label branding  
- Seeded, **calibrated** catalog template (hours that behave like a real shop)  
- Detailing AI for oxidation, acrylic haze, brightwork cut levels, ceramic failure, interior soil/odor paths  
- **No live customer data** — preview only until you convert  

### What’s *not* day-one

- Custom domain (comes later)  
- Migrating your entire history from another system (scoped separately)  
- Replacing OEM / manufacturer specs — AI assists diagnosis; your techs own the call  

### Proof / trust

- Production CRM already live for Shiny Jets operations  
- In-CRM Detailing AI shipped for authenticated shop staff  
- Public Detailing AI brand site separate from CRM (no entanglement)

### CTA

Reply to schedule a 30-minute walkthrough. We’ll spin the complimentary Enterprise preview the same day.

**Contact:** brett@shinyjets.com · CRM login: https://crm.shinyjets.com · Public AI: https://aircraftdetailing.ai  

---

## 5. Internal positioning (do not confuse SKUs)

| Surface | Audience | Money model |
|---------|----------|-------------|
| Shopify monthly CRM tiers (Pro / Business / Enterprise) | Self-serve detailers | Monthly (legacy / storefront) |
| **White-label package (this doc)** | Partner / GECI-style | **Setup + Yearly** (Brett-locked) |
| Detailing AI add-on | CRM users / WL partners | Yearly or bundled |
| aircraftdetailing.ai | Public | Marketing; not partner hosting |

Monthly Shopify Enterprise ($299/mo style SKUs in admin/shopify-setup) remains a **different** path from white-label setup+yearly. Do not auto-merge pricing without Brett.

---

## 6. Related paths

| Doc / surface | Path |
|---------------|------|
| This offering | `docs/white-label-offering.md` |
| Domain cutover | `/workspace/uploads/adai-domain-cutover.md` (also keep CRM-only host) |
| Detailing AI CRM v1 | `/workspace/uploads/detailing-ai-crm-v1.md` · PR #7 |
| Comp invites API | `app/api/admin/comp-invites/route.js` · `lib/comp-invites.js` |
| Branding rules | `lib/branding.js` · `lib/plan-features.js` |
| Public lander | `/Users/brettberry/aircraftdetailing-ai` |

---

## 7. Open decisions for Brett

1. Final **Setup** and **Year** dollar amounts (replace EXAMPLE).  
2. Is Detailing AI **bundled** in Year or always a line-item add-on?  
3. Hard monthly **token allotment** numbers + overage rate.  
4. Preview length default (`trial_ends_at`, e.g. 60 / 90 days).  
5. When to offer **custom domain** as a paid setup add-on.

