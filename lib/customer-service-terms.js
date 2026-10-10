// Customer-facing service terms for quotes, invoices, the customer portal,
// quote PDFs, and /legal/quote-terms.
//
// Two documents:
// - Platform terms (Shiny Jets). Shown on /legal/quote-terms and, when a shop
//   has not replaced them, above the shop's own terms on an invoice.
// - Default shop terms. Used when the shop leaves Settings → Terms blank.
//   A shop's saved text or uploaded PDF replaces this default. It does not
//   replace the platform terms.
//
// Plain English only. Do not add a legal promise that was not already in the
// product. Dispute venue for THESE customer terms is San Diego, California.
// Do not move it to Chino. The software Terms of Service (/terms) is a
// different contract and stays under Wyoming law.

export const CUSTOMER_TERMS_UPDATED = 'October 10, 2026';
export const PLATFORM_TERMS_VERSION = '2026-10-10';

export const CUSTOMER_TERMS_HEADINGS = [
  'What this quote covers',
  'How long this quote is good',
  'Deposits and when you pay',
  'Card processing fee',
  'Cancellation and rescheduling',
  'Weather and access',
  'Damage, liability, and condition already on the aircraft',
  'Disputes',
];

const PLATFORM_BODIES = {
  'What this quote covers':
    'The quote lists the services and the price for the aircraft described on it. It is an estimate. The final work and the final price are set after the detailer looks at the aircraft in person and takes photos.\n\nIf the aircraft\'s condition needs more work than the quote describes, such as extra cutting, extra passes, or extra materials, the detailer will tell you the updated price before doing that extra work. That update may be a change order. The detailer will not do the extra work unless you approve it in writing.',

  'How long this quote is good':
    'The quote is good through the "Valid until" date shown on it. After that date, ask the detailer for a new quote before you book. A date listed on the quote is not a confirmed appointment until payment is received and the detailer confirms the schedule.',

  'Deposits and when you pay':
    'The quote or invoice states which way you pay.\n\n- Pay in full. Paying the quoted total confirms the booking.\n- Deposit. The deposit amount is shown on the quote. It holds the date and is applied to the final invoice. The rest is due when the work is finished. A deposit paid to reserve a date is not refundable.\n- Book now, pay later. You may accept and schedule without paying now. The detailer sends an invoice. You pay by the due date on that invoice.\n\nPayment is due by the due date printed on the invoice. If the invoice shows a number of days, that number is counted from the invoice date.\n\nIf payment is not received within 48 hours after the invoice is sent, work already underway will pause until payment is received. Money already paid is not refunded once work has started.',

  'Card processing fee':
    'Card payments are processed by Stripe. A card processing fee may apply. If it does, the amount is shown before you pay. It is not folded into the quote total unless the screen says the total includes it.\n\nIf the detailer offers an invoice or a bank transfer, that choice does not add the card fee.\n\nIf you accept a quote, the detailing business may store your payment method for a later adjustment to the service. Your card is charged only when you approve that charge.',

  'Cancellation and rescheduling':
    'If you cancel less than 48 hours before the scheduled service, you may lose any deposit you paid. If you cancel with more notice than that, the detailer may refund the deposit in full. That refund is the detailer\'s decision.\n\nTo reschedule, contact the detailer. A new date is not confirmed until the detailer agrees to it.',

  'Weather and access':
    'Please make sure the detailer can reach the aircraft on the scheduled date. The schedule depends on availability and is confirmed when payment is received. If the detailer cannot reach the aircraft, or cannot safely do the work that day, the detailer will contact you to choose a new date.',

  'Damage, liability, and condition already on the aircraft':
    'The detailer may photograph the aircraft before, during, and after the work. The photos are a record of the aircraft\'s condition, including damage that was already there.\n\nBy sending a quote request, or by accepting a quote, you allow the detailer to take those photos. Shiny Jets may use them only for anonymous research on surface condition. Shiny Jets does not sell the photos, does not post them publicly, and does not attach them to your name. You agree that Shiny Jets is not responsible for how an individual detailing business uses the photos.\n\nShiny Jets CRM is software that connects aircraft owners with independent detailing businesses. Shiny Jets does not do the detailing work and is not responsible for the quality, timing, or result of the service. A dispute about the work is between you and the detailing business.',

  'Disputes':
    'These terms follow the laws of the State of California. Disputes are resolved by binding arbitration in San Diego, California. Questions about a charge or a refund go to the detailing business, not to Shiny Jets.',
};

const SHOP_BODIES = {
  'What this quote covers':
    'This quote lists the services and the price for the aircraft described on it. It is an estimate. The final work and the final price are set after we look at the aircraft in person and take photos.\n\nIf the aircraft\'s condition needs more work than this quote describes, such as extra cutting, extra passes, or extra materials, we will tell you the updated price before we do that extra work. That update may be a change order. We will not do the extra work unless you approve it in writing.',

  'How long this quote is good':
    'This quote is good through the "Valid until" date shown on it. After that date, ask us for a new quote before you book. A date listed on the quote is not a confirmed appointment until we receive payment and confirm the schedule.',

  'Deposits and when you pay':
    'The quote or invoice states which way you pay.\n\n- Pay in full. Paying the quoted total confirms the booking.\n- Deposit. The deposit amount is shown on the quote. It holds the date and is applied to the final invoice. The rest is due when the work is finished. A deposit paid to reserve a date is not refundable.\n- Book now, pay later. You may accept and schedule without paying now. We send an invoice. You pay by the due date on that invoice.\n\nPayment is due by the due date printed on the invoice. If the invoice shows a number of days, that number is counted from the invoice date.\n\nIf payment is not received within 48 hours after the invoice is sent, work already underway will pause until payment is received. Money already paid is not refunded once work has started.',

  'Card processing fee':
    'Card payments are processed by Stripe. A card processing fee may apply. If it does, the amount is shown before you pay. It is not folded into the quote total unless the screen says the total includes it.\n\nIf we offer an invoice or a bank transfer, that choice does not add the card fee.\n\nIf you accept a quote, we may store your payment method for a later adjustment to the service. Your card is charged only when you approve that charge.',

  'Cancellation and rescheduling':
    'If you cancel less than 48 hours before the scheduled service, you may lose any deposit you paid. If you cancel with more notice than that, we may refund the deposit in full. That refund is our decision.\n\nTo reschedule, contact us. A new date is not confirmed until we agree to it.',

  'Weather and access':
    'Please make sure we can reach the aircraft on the scheduled date. The schedule depends on availability and is confirmed when payment is received. If we cannot reach the aircraft, or we cannot safely do the work that day, we will contact you to choose a new date.',

  'Damage, liability, and condition already on the aircraft':
    'We may photograph the aircraft before, during, and after the work. The photos are a record of the aircraft\'s condition, including damage that was already there.\n\nShiny Jets CRM is the software we use to send this quote. Shiny Jets does not do the detailing work and is not responsible for the quality, timing, or result of the service. A question about the work is between you and us.',

  'Disputes':
    'These terms follow the laws of the State of California. Disputes are resolved by binding arbitration in San Diego, California. Questions about a charge or a refund come to us.',
};

function sectionsFrom(bodies) {
  return CUSTOMER_TERMS_HEADINGS.map((title) => ({ title, body: bodies[title] }));
}

export const PLATFORM_TERMS_SECTIONS = sectionsFrom(PLATFORM_BODIES);
export const SHOP_TERMS_SECTIONS = sectionsFrom(SHOP_BODIES);

export function sectionsToMarkdown(sections, intro) {
  const parts = [];
  if (intro) parts.push(intro.trim());
  for (const section of sections) {
    parts.push(`## ${section.title}\n\n${section.body.trim()}`);
  }
  return parts.join('\n\n');
}

export const PLATFORM_TERMS_INTRO =
  'These are the service terms for a quote or invoice sent through Shiny Jets CRM. Please read them before you request a quote, accept a quote, or pay.';

export const SHOP_TERMS_INTRO =
  'These terms explain what you are agreeing to when you accept this quote or pay this invoice.';

export const PLATFORM_TERMS_MARKDOWN = sectionsToMarkdown(PLATFORM_TERMS_SECTIONS, PLATFORM_TERMS_INTRO);
export const DEFAULT_SHOP_TERMS_MARKDOWN = sectionsToMarkdown(SHOP_TERMS_SECTIONS, SHOP_TERMS_INTRO);

// Optional shop note. Not applied unless the shop saves it. It does not add a
// liability waiver that the product did not already state.
export const SUGGESTED_DISCLAIMER =
  'We photograph the aircraft before we start. Those photos show its condition, including damage that was already there. Tell us before we start if you want something specific noted.';

export function shopTermsAreCustom(termsText) {
  return String(termsText || '').trim().length > 0;
}

// Saved shop text wins. A blank field means the default wording.
export function resolveShopTermsText(termsText) {
  const custom = String(termsText || '').trim();
  return custom || DEFAULT_SHOP_TERMS_MARKDOWN;
}

// Split markdown into heading / paragraph / bullet blocks for the quote PDF
// and any other plain-text surface. This is the same small subset MarkdownLite
// renders on the web: ## headings, "- " bullets, and paragraphs.
export function markdownToBlocks(markdown) {
  const blocks = [];
  const chunks = String(markdown || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('## ')) {
      const text = trimmed.slice(3).trim();
      if (text) blocks.push({ type: 'heading', text });
      continue;
    }
    if (trimmed.startsWith('# ')) {
      const text = trimmed.slice(2).trim();
      if (text) blocks.push({ type: 'heading', text });
      continue;
    }
    const lines = trimmed.split('\n');
    if (lines.every((line) => /^\s*[-*] /.test(line))) {
      for (const line of lines) {
        const text = line.replace(/^\s*[-*] /, '').trim();
        if (text) blocks.push({ type: 'bullet', text });
      }
      continue;
    }
    const text = lines.join(' ').replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ type: 'paragraph', text });
  }
  return blocks;
}

// Plain sentence for an invoice's net-terms number. Null when there is no
// usable day count. Does not invent a due date; the invoice still shows one.
export function netTermsSentence(days) {
  const n = parseInt(days, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n === 1) return 'Payment is due within 1 day of the invoice date.';
  return `Payment is due within ${n} days of the invoice date.`;
}

// Card-fee captions. `includedInTotal` matches screens that add the fee into
// the figure the customer is looking at (the customer portal, pass-through).
// Quote and PDF totals do not include the fee.
export function cardFeeSentence(mode, { amountLabel = '', includedInTotal = false, noFeeBy = 'invoice' } = {}) {
  if (mode !== 'pass' && mode !== 'customer_choice') return '';
  const fee = amountLabel ? `a ${amountLabel} processing fee` : 'a processing fee';
  if (mode === 'customer_choice') {
    const other = noFeeBy === 'ach'
      ? 'A bank transfer does not add that fee.'
      : 'An invoice or bank transfer does not add that fee.';
    return `Paying by card adds ${fee}. ${other}`;
  }
  if (includedInTotal) return `This total includes ${fee} for paying by card.`;
  return `Paying by card adds ${fee}. That fee is not included in the total above.`;
}

export function invoiceCardFeeSentence(amountLabel) {
  if (!amountLabel) return 'Paying by card adds a processing fee. A bank transfer does not.';
  return `Paying by card adds a ${amountLabel} processing fee. A bank transfer does not.`;
}

export const PDF_TERMS_PDF_ONLY =
  'This shop\'s full terms are the PDF linked on the quote page. You agree to those terms when you accept.';

export function paymentDisputeSentence(company) {
  const who = company && String(company).trim() ? String(company).trim() : 'the detailing business';
  return `Stripe processes the payment. A question about a charge or a refund goes to ${who}.`;
}
