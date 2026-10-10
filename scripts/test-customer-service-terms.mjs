/**
 * Plain-language customer service terms.
 * Usage: node scripts/test-customer-service-terms.mjs
 */
import assert from 'assert/strict';
import fs from 'fs';
import {
  CUSTOMER_TERMS_HEADINGS,
  PLATFORM_TERMS_MARKDOWN,
  DEFAULT_SHOP_TERMS_MARKDOWN,
  PLATFORM_TERMS_VERSION,
  resolveShopTermsText,
  shopTermsAreCustom,
  netTermsSentence,
  cardFeeSentence,
  invoiceCardFeeSentence,
  markdownToBlocks,
  paymentDisputeSentence,
} from '../lib/customer-service-terms.js';

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const bannedVenue = [/Chino/i, /Wyoming/, /San Bernardino/];

function assertCustomerVenue(label, text) {
  assert.match(text, /San Diego, California/, `${label} keeps San Diego`);
  assert.match(text, /binding arbitration/, `${label} keeps arbitration`);
  assert.match(text, /State of California/, `${label} keeps California law`);
  for (const re of bannedVenue) {
    assert.doesNotMatch(text, re, `${label} must not move venue (${re})`);
  }
}

for (const heading of CUSTOMER_TERMS_HEADINGS) {
  assert.ok(PLATFORM_TERMS_MARKDOWN.includes(`## ${heading}`), `platform missing ${heading}`);
  assert.ok(DEFAULT_SHOP_TERMS_MARKDOWN.includes(`## ${heading}`), `shop default missing ${heading}`);
}

assertCustomerVenue('platform terms', PLATFORM_TERMS_MARKDOWN);
assertCustomerVenue('default shop terms', DEFAULT_SHOP_TERMS_MARKDOWN);

assert.equal(resolveShopTermsText(''), DEFAULT_SHOP_TERMS_MARKDOWN);
assert.equal(resolveShopTermsText('   '), DEFAULT_SHOP_TERMS_MARKDOWN);
assert.equal(resolveShopTermsText('  Shop rule.  '), 'Shop rule.');
assert.equal(shopTermsAreCustom(''), false);
assert.equal(shopTermsAreCustom('Shop rule.'), true);

assert.equal(netTermsSentence(30), 'Payment is due within 30 days of the invoice date.');
assert.equal(netTermsSentence('1'), 'Payment is due within 1 day of the invoice date.');
assert.equal(netTermsSentence(0), null);
assert.equal(netTermsSentence('nope'), null);

assert.match(cardFeeSentence('pass', { amountLabel: '$4.20' }), /Paying by card adds a \$4\.20 processing fee/);
assert.match(cardFeeSentence('pass', { amountLabel: '$4.20' }), /not included in the total/);
assert.match(cardFeeSentence('pass', { amountLabel: '$4.20', includedInTotal: true }), /This total includes a \$4\.20 processing fee/);
assert.match(cardFeeSentence('customer_choice'), /invoice or bank transfer does not/);
assert.match(cardFeeSentence('customer_choice', { noFeeBy: 'ach' }), /bank transfer does not/);
assert.equal(cardFeeSentence('absorb'), '');
assert.match(invoiceCardFeeSentence('$2.00'), /Paying by card adds a \$2\.00 processing fee\. A bank transfer does not\./);

const blocks = markdownToBlocks(DEFAULT_SHOP_TERMS_MARKDOWN);
assert.ok(blocks.some((b) => b.type === 'heading' && b.text === 'Disputes'));
assert.ok(blocks.some((b) => b.type === 'bullet' && /Deposit/.test(b.text)));
assert.ok(blocks.every((b) => b.text && !b.text.includes('##')));

assert.match(paymentDisputeSentence('Hangar One'), /Hangar One/);
assert.match(paymentDisputeSentence(''), /the detailing business/);
assert.equal(PLATFORM_TERMS_VERSION, '2026-10-10');

assert.match(DEFAULT_SHOP_TERMS_MARKDOWN, /not responsible for damage, wear, or defects/);
assert.match(PLATFORM_TERMS_MARKDOWN, /not responsible for damage, wear, or defects/);
assert.match(DEFAULT_SHOP_TERMS_MARKDOWN, /own negligence/);
assert.match(PLATFORM_TERMS_MARKDOWN, /own negligence/);
assert.match(DEFAULT_SHOP_TERMS_MARKDOWN, /de-ice boots/);
assert.match(DEFAULT_SHOP_TERMS_MARKDOWN, /failing paint/);
assert.match(DEFAULT_SHOP_TERMS_MARKDOWN, /change order/);
assert.match(DEFAULT_SHOP_TERMS_MARKDOWN, /48-hour pause does not apply to Book now, pay later/);
assert.doesNotMatch(DEFAULT_SHOP_TERMS_MARKDOWN, /unpaid 48 hours after the invoice is sent/);
assert.match(DEFAULT_SHOP_TERMS_MARKDOWN, /not refundable/);

const tos = read('app/terms/page.jsx');
assert.match(tos, /State of California/);
assert.match(tos, /San Diego, California/);
assert.match(tos, /binding arbitration/);
assert.match(tos, /American Arbitration Association/);
assert.doesNotMatch(tos, /Wyoming/);
assert.doesNotMatch(tos, /Chino/);
assert.match(tos, /\/legal\/quote-terms/);

const legal = read('app/legal/quote-terms/page.jsx');
assert.match(legal, /PLATFORM_TERMS_SECTIONS/);
assert.doesNotMatch(legal, /Chino/);

const migration = read('supabase/migrations/20261010_plain_customer_terms.sql');
const copies = [...migration.matchAll(/\$sjterms\$([\s\S]*?)\$sjterms\$/g)].map((m) => m[1]);
assert.ok(copies.length >= 1, 'migration stores the platform terms');
for (const copy of copies) assert.equal(copy, PLATFORM_TERMS_MARKDOWN);
assert.match(migration, /2026-10-10/);
assert.match(migration, /San Diego, California/);

const settingsRoute = read('app/api/settings/terms/route.js');
assert.match(settingsRoute, /terms_text/);
assert.match(settingsRoute, /terms_pdf_url/);

for (const file of ['app/q/[shareLink]/page.jsx', 'app/portal/[token]/page.jsx']) {
  const src = read(file);
  assert.match(src, /ServiceTermsAgreeLabel/);
  assert.doesNotMatch(src, /Terms & Conditions for this service/);
}

const pdf = read('lib/quote-pdf.jsx');
assert.match(pdf, /markdownToBlocks/);
assert.doesNotMatch(pdf, /Scheduling is subject to availability/);
assert.doesNotMatch(pdf, /slice\(0, 200\)/);

console.log('customer service terms ok');
