-- Plain-language Shiny Jets service terms for quotes and invoices.
-- Venue stays San Diego, California. Do not move this venue.
-- Body must match PLATFORM_TERMS_MARKDOWN in lib/customer-service-terms.js (2026-10-10).

CREATE TABLE IF NOT EXISTS platform_legal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  body_md text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT false
);

UPDATE platform_legal_versions
SET is_active = false
WHERE is_active = true
  AND version IS DISTINCT FROM '2026-10-10';

INSERT INTO platform_legal_versions (version, body_md, effective_at, is_active)
SELECT '2026-10-10', $sjterms$These are the service terms for a quote or invoice sent through Shiny Jets CRM. Please read them before you request a quote, accept a quote, or pay.

## What this quote covers

The quote lists the services and the price for the aircraft described on it. It is an estimate. The final work and the final price are set after the detailer looks at the aircraft in person and takes photos.

If the aircraft's condition needs more work than the quote describes, such as extra cutting, extra passes, or extra materials, the detailer will tell you the updated price before doing that extra work. That update may be a change order. The detailer will not do the extra work unless you approve it in writing.

## How long this quote is good

The quote is good through the "Valid until" date shown on it. After that date, ask the detailer for a new quote before you book. A date listed on the quote is not a confirmed appointment until payment is received and the detailer confirms the schedule.

## Deposits and when you pay

The quote or invoice states which way you pay.

- Pay in full. Paying the quoted total confirms the booking.
- Deposit. The deposit amount is shown on the quote. It holds the date and is applied to the final invoice. The rest is due when the work is finished. A deposit paid to reserve a date is not refundable.
- Book now, pay later. You may accept and schedule without paying now. The detailer sends an invoice. You pay by the due date on that invoice.

Payment is due by the due date printed on the invoice. If the invoice shows a number of days, that number is counted from the invoice date.

If payment is not received within 48 hours after the invoice is sent, work already underway will pause until payment is received. Money already paid is not refunded once work has started.

## Card processing fee

Card payments are processed by Stripe. A card processing fee may apply. If it does, the amount is shown before you pay. It is not folded into the quote total unless the screen says the total includes it.

If the detailer offers an invoice or a bank transfer, that choice does not add the card fee.

If you accept a quote, the detailing business may store your payment method for a later adjustment to the service. Your card is charged only when you approve that charge.

## Cancellation and rescheduling

If you cancel less than 48 hours before the scheduled service, you may lose any deposit you paid. If you cancel with more notice than that, the detailer may refund the deposit in full. That refund is the detailer's decision.

To reschedule, contact the detailer. A new date is not confirmed until the detailer agrees to it.

## Weather and access

Please make sure the detailer can reach the aircraft on the scheduled date. The schedule depends on availability and is confirmed when payment is received. If the detailer cannot reach the aircraft, or cannot safely do the work that day, the detailer will contact you to choose a new date.

## Damage, liability, and condition already on the aircraft

The detailer may photograph the aircraft before, during, and after the work. The photos are a record of the aircraft's condition, including damage that was already there.

By sending a quote request, or by accepting a quote, you allow the detailer to take those photos. Shiny Jets may use them only for anonymous research on surface condition. Shiny Jets does not sell the photos, does not post them publicly, and does not attach them to your name. You agree that Shiny Jets is not responsible for how an individual detailing business uses the photos.

Shiny Jets CRM is software that connects aircraft owners with independent detailing businesses. Shiny Jets does not do the detailing work and is not responsible for the quality, timing, or result of the service. A dispute about the work is between you and the detailing business.

## Disputes

These terms follow the laws of the State of California. Disputes are resolved by binding arbitration in San Diego, California. Questions about a charge or a refund go to the detailing business, not to Shiny Jets.$sjterms$, now(), true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_legal_versions WHERE version = '2026-10-10'
);

UPDATE platform_legal_versions
SET body_md = $sjterms$These are the service terms for a quote or invoice sent through Shiny Jets CRM. Please read them before you request a quote, accept a quote, or pay.

## What this quote covers

The quote lists the services and the price for the aircraft described on it. It is an estimate. The final work and the final price are set after the detailer looks at the aircraft in person and takes photos.

If the aircraft's condition needs more work than the quote describes, such as extra cutting, extra passes, or extra materials, the detailer will tell you the updated price before doing that extra work. That update may be a change order. The detailer will not do the extra work unless you approve it in writing.

## How long this quote is good

The quote is good through the "Valid until" date shown on it. After that date, ask the detailer for a new quote before you book. A date listed on the quote is not a confirmed appointment until payment is received and the detailer confirms the schedule.

## Deposits and when you pay

The quote or invoice states which way you pay.

- Pay in full. Paying the quoted total confirms the booking.
- Deposit. The deposit amount is shown on the quote. It holds the date and is applied to the final invoice. The rest is due when the work is finished. A deposit paid to reserve a date is not refundable.
- Book now, pay later. You may accept and schedule without paying now. The detailer sends an invoice. You pay by the due date on that invoice.

Payment is due by the due date printed on the invoice. If the invoice shows a number of days, that number is counted from the invoice date.

If payment is not received within 48 hours after the invoice is sent, work already underway will pause until payment is received. Money already paid is not refunded once work has started.

## Card processing fee

Card payments are processed by Stripe. A card processing fee may apply. If it does, the amount is shown before you pay. It is not folded into the quote total unless the screen says the total includes it.

If the detailer offers an invoice or a bank transfer, that choice does not add the card fee.

If you accept a quote, the detailing business may store your payment method for a later adjustment to the service. Your card is charged only when you approve that charge.

## Cancellation and rescheduling

If you cancel less than 48 hours before the scheduled service, you may lose any deposit you paid. If you cancel with more notice than that, the detailer may refund the deposit in full. That refund is the detailer's decision.

To reschedule, contact the detailer. A new date is not confirmed until the detailer agrees to it.

## Weather and access

Please make sure the detailer can reach the aircraft on the scheduled date. The schedule depends on availability and is confirmed when payment is received. If the detailer cannot reach the aircraft, or cannot safely do the work that day, the detailer will contact you to choose a new date.

## Damage, liability, and condition already on the aircraft

The detailer may photograph the aircraft before, during, and after the work. The photos are a record of the aircraft's condition, including damage that was already there.

By sending a quote request, or by accepting a quote, you allow the detailer to take those photos. Shiny Jets may use them only for anonymous research on surface condition. Shiny Jets does not sell the photos, does not post them publicly, and does not attach them to your name. You agree that Shiny Jets is not responsible for how an individual detailing business uses the photos.

Shiny Jets CRM is software that connects aircraft owners with independent detailing businesses. Shiny Jets does not do the detailing work and is not responsible for the quality, timing, or result of the service. A dispute about the work is between you and the detailing business.

## Disputes

These terms follow the laws of the State of California. Disputes are resolved by binding arbitration in San Diego, California. Questions about a charge or a refund go to the detailing business, not to Shiny Jets.$sjterms$,
    is_active = true,
    effective_at = now()
WHERE version = '2026-10-10';
