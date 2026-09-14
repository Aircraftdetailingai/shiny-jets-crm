# Customer Aircraft Portal v1

Tight v1 for a customer-facing aircraft dashboard. Build on existing `/portal` magic-link stack (`customer_accounts`, `customer_aircraft`, `portal_token`).

## Goals
- Customer can sign in, see their aircraft list, open one aircraft, see job status + photos.
- Shareable read-only aircraft link via token (already partially built).

## Auth
- **Primary:** email magic link (`POST /api/portal/auth/send-link` → `/portal/auth/callback?token=…` → httpOnly `portal_token` JWT, 30d).
- **Secondary:** aircraft share token URL `/portal/aircraft/[tail]/share/[token]` (no account required, read-only).
- Out of scope for v1: password accounts, OAuth social login, crew/detailer impersonation UI.

## Routes (v1)
| Route | Auth | Purpose |
|-------|------|---------|
| `/portal/login` | public | Request magic link |
| `/portal/auth/callback` | token | Complete magic link |
| `/portal` | portal JWT | Aircraft list + upcoming jobs |
| `/portal/aircraft/[tail]` | portal JWT | Aircraft detail: jobs, % if available, photos |
| `/portal/aircraft/[tail]/share/[token]` | share token | Read-only same summary |
| `/portal/onboarding` | portal JWT | Add aircraft (existing) |

Reuse APIs under `/api/portal/*`. Prefer extending `/api/portal/me` and `/api/portal/aircraft/[tail]` over new trees.

## Data shown (v1)
Per customer:
- Aircraft list: tail, model/make, nickname, home airport.

Per aircraft:
- Service/job list: date, status, airport, detailer-facing title (safe fields only).
- **Job progress %** when CRM stores it (e.g. job progress / SOP completion); if absent, show status chip only — do not invent %.
- Photos: before/after (and in-progress if `job_media` has them), lightbox.
- Last service / days since service (existing stats OK).

Privacy: never expose Stripe secrets, crew PINs, internal notes marked private, other customers' tails.

## Explicitly out of scope (v1)
- **Podium** (or any review-platform deep integration beyond existing Google review URL).
- **SMS** / Twilio (no text magic links, no job SMS until Twilio is wired).
- Live chat / messaging inbox (defer; `/customer` messages stay separate).
- Payments inside aircraft portal (keep quote `/q/[shareLink]` + invoice links).
- Push notifications, native apps.
- Merging `/customer/*` and `/portal/*` (document dual stack; consolidate later).

## Non-goals / later
- Real-time progress websocket.
- Customer-uploaded photos.
- Multi-language polish beyond existing portal language hooks.
