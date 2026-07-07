// Round-trip verification for the bugfix bundle. Service-role client against
// live DB. Creates ZZ_TEST temp rows, asserts, cleans up (even on failure),
// exits nonzero on any FAIL. Mirrors the route logic edited in this bundle.
//
// Run: node scripts/verify-bugfix-roundtrip.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DETAILER_ID = '9f2b9f6a-a104-4497-a5fc-735ab3a7c170';

function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(path.join(__dirname, '..', '.env.production'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      // Values are quoted and may carry a literal "\n" — mirror lib cleanKey.
      if (m) env[m[1]] = env[m[1]] ?? m[2].trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '').trim();
    }
  } catch (e) { console.warn('Could not read .env.production:', e.message); }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('FAIL: missing Supabase env'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

let failures = 0;
const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond });
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`);
}

const leadIds = [];
const quoteIds = [];

async function insertLead(fields) {
  const row = { detailer_id: DETAILER_ID, name: 'ZZ_TEST lead', source: 'ZZ_TEST', status: 'new', ...fields };
  const { data, error } = await supabase.from('intake_leads').insert(row).select('*').single();
  if (error) throw new Error(`insertLead failed: ${error.message}`);
  leadIds.push(data.id);
  return data;
}
async function insertQuote(fields) {
  const row = {
    detailer_id: DETAILER_ID, aircraft_type: 'ZZ_TEST', services: {}, status: 'sent',
    share_link: `ZZTEST-${Math.floor(Math.random() * 1e9)}-${quoteIds.length}`, total_price: 1000,
    ...fields,
  };
  const { data, error } = await supabase.from('quotes').insert(row).select('*').single();
  if (error) throw new Error(`insertQuote failed: ${error.message}`);
  quoteIds.push(data.id);
  return data;
}
const readQuote = async (id) => (await supabase.from('quotes').select('*').eq('id', id).single()).data;
const readLead = async (id) => (await supabase.from('intake_leads').select('*').eq('id', id).single()).data;

// ---- Mirror of app/api/quotes/view/[shareLink] tracking logic ----
async function applyViewUpdate(quote) {
  const now = new Date().toISOString();
  const isFirstView = !quote.viewed_at;
  const updateData = {
    last_viewed_at: now,
    view_count: (quote.view_count || 0) + 1,
    viewer_ip: '1.2.3.4',
    viewer_device: 'ZZ_TEST',
  };
  if (isFirstView) updateData.viewed_at = now;
  if (quote.status === 'sent' || quote.status === 'viewed') updateData.status = 'viewed';
  const { error } = await supabase.from('quotes').update(updateData).eq('id', quote.id);
  if (error) throw new Error(`applyViewUpdate failed: ${error.message}`);
}

// ---- Mirror of create-checkout already-paid guard ----
const checkoutBlocked = (status) => status === 'paid' || status === 'approved' || status === 'deposit_paid';

// ---- Mirror of stripe webhook quote-path (idempotent). quotes_status_check has
// been widened, so this runs against the real DB. ----
async function simulateQuoteWebhook(quoteId, isDeposit, depositPct) {
  const quote = await readQuote(quoteId);
  if (isDeposit && quote.status === 'deposit_paid') return 'skipped';
  if (!isDeposit && (quote.status === 'paid' || quote.status === 'approved')) return 'skipped';
  if (isDeposit) {
    const depositAmount = Math.round((quote.total_price || 0) * depositPct) / 100;
    const { error: uErr } = await supabase.from('quotes').update({
      status: 'deposit_paid', paid_at: new Date().toISOString(),
      amount_paid: depositAmount, balance_due: (quote.total_price || 0) - depositAmount,
    }).eq('id', quoteId);
    if (uErr) throw new Error(`webhook deposit update failed: ${uErr.message}`);
    const { error: iErr } = await supabase.from('invoices').insert({
      detailer_id: quote.detailer_id, quote_id: quote.id, invoice_number: `ZZ-INV-${Math.floor(Math.random() * 1e9)}`,
      status: 'partially_paid', customer_name: '', customer_email: '', detailer_name: '', detailer_email: '', detailer_company: '',
      aircraft: quote.aircraft_type || '', aircraft_model: quote.aircraft_model || quote.aircraft_type || '',
      total: quote.total_price || 0, subtotal: quote.total_price || 0, amount_paid: depositAmount,
      deposit_amount: depositAmount, balance_due: (quote.total_price || 0) - depositAmount,
      booking_mode: 'deposit', due_date: new Date(Date.now() + 30 * 864e5).toISOString(),
    });
    if (iErr) throw new Error(`webhook invoice insert failed: ${iErr.message}`);
    return 'deposit_processed';
  }
  const { error: uErr } = await supabase.from('quotes').update({
    status: 'paid', paid_at: new Date().toISOString(), amount_paid: quote.total_price || 0, balance_due: 0,
  }).eq('id', quoteId);
  if (uErr) throw new Error(`webhook full update failed: ${uErr.message}`);
  return 'full_processed';
}
const invoiceCount = async (quoteId) =>
  (await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('quote_id', quoteId)).count || 0;

// ---- Mirror of request-new metadata dedupe ----
async function simulateRequestNew(quoteId, shareLink) {
  const quote = await readQuote(quoteId);
  if (quote.metadata?.new_quote_requested_at) return 'already_requested';
  const meta = { ...(quote.metadata || {}), new_quote_requested_at: new Date().toISOString() };
  const { error } = await supabase.from('quotes').update({ metadata: meta }).eq('id', quoteId).eq('share_link', shareLink);
  if (error) throw new Error(`request-new stamp failed: ${error.message}`);
  return 'sent';
}

// ---- Mirror of leads dedupe (detailer + lower(email) within 2 min) ----
async function simulateLeadSubmit(email, name) {
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: recent } = await supabase.from('intake_leads').select('*')
    .eq('detailer_id', DETAILER_ID).gte('created_at', since).order('created_at', { ascending: false });
  const match = (recent || []).find(l => (l.email || '').toLowerCase() === email.toLowerCase());
  if (match) return { deduped: true, id: match.id };
  const lead = await insertLead({ email, name });
  return { deduped: false, id: lead.id };
}

async function main() {
  // (i) intake_leads accepts 'awaiting_photos'
  const leadI = await insertLead({ status: 'awaiting_photos', email: 'zz_i@test.dev' });
  const reReadI = await readLead(leadI.id);
  check("(i) intake_leads accepts status='awaiting_photos'", reReadI?.status === 'awaiting_photos', `status=${reReadI?.status}`);

  // (ii) token-persist then stamp (mirror request-photos step order)
  const leadII = await insertLead({ email: 'zz_ii@test.dev' });
  const token = `ZZ_TOK_${Math.floor(Math.random() * 1e9)}`;
  await supabase.from('intake_leads').update({ photo_request_token: token }).eq('id', leadII.id);
  await supabase.from('intake_leads').update({ photo_request_sent_at: new Date().toISOString(), status: 'awaiting_photos' }).eq('id', leadII.id);
  const reReadII = await readLead(leadII.id);
  check('(ii) token + sent_at + status persisted', reReadII?.photo_request_token === token && !!reReadII?.photo_request_sent_at && reReadII?.status === 'awaiting_photos',
    `token=${reReadII?.photo_request_token === token} sent_at=${!!reReadII?.photo_request_sent_at} status=${reReadII?.status}`);

  // (iii) view-preserve — REAL DB round-trips. accepted/scheduled/deposit_paid
  // keep their status; sent -> viewed. All statuses persist now.
  for (const st of ['accepted', 'scheduled', 'deposit_paid']) {
    const q = await insertQuote({ status: st, view_count: 0 });
    await applyViewUpdate(q);
    const after = await readQuote(q.id);
    check(`(iii) view keeps status='${st}' + increments view_count (DB)`, after.status === st && after.view_count === 1, `status=${after.status} view_count=${after.view_count}`);
  }
  const qSent = await insertQuote({ status: 'sent', view_count: 0 });
  await applyViewUpdate(qSent);
  const qSentAfter = await readQuote(qSent.id);
  check("(iii) view flips 'sent' -> 'viewed' + increments (DB)", qSentAfter.status === 'viewed' && qSentAfter.view_count === 1, `status=${qSentAfter.status} view_count=${qSentAfter.view_count}`);

  // (iv) checkout guard
  check('(iv) checkout blocks paid/approved/deposit_paid; allows accepted/sent',
    checkoutBlocked('paid') && checkoutBlocked('approved') && checkoutBlocked('deposit_paid') && !checkoutBlocked('accepted') && !checkoutBlocked('sent'),
    `paid=${checkoutBlocked('paid')} deposit_paid=${checkoutBlocked('deposit_paid')} accepted=${checkoutBlocked('accepted')}`);

  // (v-a) webhook idempotency — REAL DB: already-paid quote → skip, no update, no invoice.
  const qPaid = await insertQuote({ status: 'paid' });
  const rPaid = await simulateQuoteWebhook(qPaid.id, false, 0);
  const paidAfter = await readQuote(qPaid.id);
  const paidInv = await invoiceCount(qPaid.id);
  check('(v a) webhook skips already-paid quote (no update, no invoice) (DB)',
    rPaid === 'skipped' && paidAfter.status === 'paid' && paidInv === 0, `result=${rPaid} status=${paidAfter.status} invoices=${paidInv}`);

  // (v-b) deposit path run TWICE on an unpaid quote → exactly ONE invoice (idempotency
  // AND the invoice insert succeeds with the new columns).
  const qDep = await insertQuote({ status: 'sent' });
  const r1 = await simulateQuoteWebhook(qDep.id, true, 25);
  const r2 = await simulateQuoteWebhook(qDep.id, true, 25);
  const depAfter = await readQuote(qDep.id);
  const invCount = await invoiceCount(qDep.id);
  check('(v b) deposit webhook idempotent → exactly ONE invoice (DB)',
    r1 === 'deposit_processed' && r2 === 'skipped' && depAfter.status === 'deposit_paid' && invCount === 1,
    `r1=${r1} r2=${r2} status=${depAfter.status} invoices=${invCount}`);

  // (vi) request-new dedupe
  const qReq = await insertQuote({ status: 'expired' });
  const rn1 = await simulateRequestNew(qReq.id, qReq.share_link);
  const metaAfter1 = (await readQuote(qReq.id)).metadata?.new_quote_requested_at;
  const rn2 = await simulateRequestNew(qReq.id, qReq.share_link);
  const metaAfter2 = (await readQuote(qReq.id)).metadata?.new_quote_requested_at;
  check('(vi) request-new: first sends, second already_requested (stamped once)',
    rn1 === 'sent' && rn2 === 'already_requested' && metaAfter1 && metaAfter1 === metaAfter2, `rn1=${rn1} rn2=${rn2} sameStamp=${metaAfter1 === metaAfter2}`);

  // (vii) leads dedupe within window
  const dupEmail = `ZZ_dup_${Math.floor(Math.random() * 1e9)}@test.dev`;
  const s1 = await simulateLeadSubmit(dupEmail, 'ZZ_TEST dup');
  const s2 = await simulateLeadSubmit(dupEmail.toUpperCase(), 'ZZ_TEST dup'); // case-insensitive
  const { count: dupCount } = await supabase.from('intake_leads').select('id', { count: 'exact', head: true })
    .eq('detailer_id', DETAILER_ID).ilike('email', dupEmail);
  check('(vii) leads dedupe: two submits same email → one row', !s1.deduped && s2.deduped && s1.id === s2.id && dupCount === 1,
    `first_deduped=${s1.deduped} second_deduped=${s2.deduped} rows=${dupCount}`);
}

async function cleanup() {
  try {
    if (quoteIds.length) {
      const { error: iErr } = await supabase.from('invoices').delete().in('quote_id', quoteIds);
      if (iErr) console.error('Cleanup invoices failed:', iErr.message);
      const { error: qErr } = await supabase.from('quotes').delete().in('id', quoteIds);
      if (qErr) console.error('Cleanup quotes failed:', qErr.message);
    }
    if (leadIds.length) {
      const { error: lErr } = await supabase.from('intake_leads').delete().in('id', leadIds);
      if (lErr) console.error('Cleanup leads failed:', lErr.message);
    }
    console.log(`Cleaned up ${quoteIds.length} quote(s), ${leadIds.length} lead(s), and their invoices.`);
  } catch (e) { console.error('Cleanup exception:', e.message); }
}

try {
  await main();
} catch (e) {
  console.error('FATAL:', e.message);
  failures++;
} finally {
  await cleanup();
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`} (${results.filter(r => r.pass).length}/${results.length})`);
process.exit(failures === 0 ? 0 : 1);
