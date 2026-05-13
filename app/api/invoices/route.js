import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - List all invoices for the authenticated detailer
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('invoices')
      .select('*')
      .eq('detailer_id', user.detailer_id || user.id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Invoices fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate: only show the "best" invoice per job — paid > viewed > sent > draft
    const statusRank = { paid: 1, viewed: 2, sent: 3, draft: 4 };
    const bestByJob = {};
    const noJob = [];
    for (const inv of data || []) {
      if (!inv.job_id && !inv.quote_id) { noJob.push(inv); continue; }
      const key = inv.job_id || inv.quote_id;
      const existing = bestByJob[key];
      if (!existing || (statusRank[inv.status] || 5) < (statusRank[existing.status] || 5)) {
        bestByJob[key] = inv;
      }
    }
    const invoices = [...Object.values(bestByJob), ...noJob]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Calculate totals from deduplicated list only
    const totalOutstanding = invoices
      .filter(i => i.status !== 'paid' && i.status !== 'draft')
      .reduce((sum, i) => sum + parseFloat(i.balance_due || i.total || 0), 0);

    return Response.json({ invoices, total_outstanding: Math.round(totalOutstanding * 100) / 100 });
  } catch (err) {
    console.error('Invoices GET error:', err);
    return Response.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// POST - Create a new invoice
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const {
      job_id,
      customer_name,
      customer_email,
      aircraft_model,
      tail_number,
      line_items,
      total,
      net_terms,
      notes,
      issued_date: body_issued_date,
      due_date: body_due_date,
      service_date: body_service_date,
      booking_mode: body_booking_mode,
      deposit_percentage: body_deposit_pct,
      deposit_amount: body_deposit_amount,
    } = body;

    if (!customer_name || !customer_email || !line_items || !total) {
      return Response.json({ error: 'Missing required fields: customer_name, customer_email, line_items, total' }, { status: 400 });
    }

    // Tier gate + validation for deposit fields. Allow writes that don't
    // touch deposit fields at all (e.g. Free-tier draft creates without
    // deposits) — only block when free-tier tries to set deposit_*.
    const totalNum = parseFloat(total) || 0;
    let validBookingMode = null;
    let validDepositPct = 0;
    let validDepositAmount = 0;
    const depositTouched = body_booking_mode !== undefined
      || body_deposit_pct !== undefined
      || body_deposit_amount !== undefined;
    if (depositTouched) {
      const { data: detailerRow } = await supabase
        .from('detailers')
        .select('plan, is_admin')
        .eq('id', user.id)
        .single();
      const plan = detailerRow?.plan || 'free';
      const isAdmin = detailerRow?.is_admin === true;
      const wantsDeposit = body_booking_mode === 'pay_to_book'
        || (parseFloat(body_deposit_pct) || 0) > 0
        || (parseFloat(body_deposit_amount) || 0) > 0;
      if (wantsDeposit && plan === 'free' && !isAdmin) {
        return Response.json({ error: 'Deposits require a Pro plan or higher.' }, { status: 403 });
      }
      if (body_booking_mode != null && !['regular', 'pay_to_book'].includes(body_booking_mode)) {
        return Response.json({ error: 'Invalid booking_mode (expected regular or pay_to_book).' }, { status: 400 });
      }
      validBookingMode = body_booking_mode || (wantsDeposit ? 'pay_to_book' : 'regular');
      const pctNum = parseFloat(body_deposit_pct);
      if (!Number.isNaN(pctNum)) {
        if (pctNum < 0 || pctNum > 100) {
          return Response.json({ error: 'deposit_percentage must be between 0 and 100.' }, { status: 400 });
        }
        validDepositPct = pctNum;
      }
      const amtNum = parseFloat(body_deposit_amount);
      if (!Number.isNaN(amtNum)) {
        if (amtNum < 0) {
          return Response.json({ error: 'deposit_amount must be >= 0.' }, { status: 400 });
        }
        if (totalNum > 0 && amtNum > totalNum) {
          return Response.json({ error: 'deposit_amount cannot exceed total.' }, { status: 400 });
        }
        validDepositAmount = amtNum;
      }
    }

    // Check for existing invoice for this job — prevent duplicates
    if (job_id) {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, status, share_link, customer_email, total, created_at')
        .eq('job_id', job_id)
        .eq('detailer_id', user.detailer_id || user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'paid') {
          return Response.json({ error: 'This job already has a paid invoice', existing_invoice: existing }, { status: 409 });
        }
        if (existing.status === 'sent' || existing.status === 'viewed') {
          // Return the existing one so client can offer to resend
          return Response.json({ invoice: existing, already_exists: true }, { status: 200 });
        }
        if (existing.status === 'draft') {
          // Return the existing draft so client reuses it
          return Response.json({ invoice: existing, already_exists: true }, { status: 200 });
        }
      }
    }

    const share_link = crypto.randomBytes(12).toString('hex');
    // Honor client-supplied dates (New Invoice modal now sets them
    // explicitly so Brett can backdate historical jobs). Fall back to
    // today / today + net_terms when the client omits them.
    const issued_date = body_issued_date
      ? new Date(body_issued_date).toISOString()
      : new Date().toISOString();
    const due_date = body_due_date
      ? new Date(body_due_date).toISOString()
      : new Date(Date.now() + (net_terms || 30) * 24 * 60 * 60 * 1000).toISOString();

    const invoiceRow = {
      detailer_id: user.detailer_id || user.id,
      job_id: job_id || null,
      customer_name,
      customer_email,
      aircraft_model: aircraft_model || '',
      tail_number: tail_number || '',
      line_items: Array.isArray(line_items) ? line_items : [],
      total: parseFloat(total) || 0,
      amount_paid: 0,
      balance_due: parseFloat(total) || 0,
      net_terms: net_terms || 30,
      notes: notes || '',
      status: 'draft',
      share_link,
      issued_date,
      due_date,
      // Deposit fields — persisted only when the client touched them.
      // Server-validated above; column-stripping retry below handles older
      // deploys that don't have the columns yet.
      booking_mode: depositTouched ? (validBookingMode || 'regular') : 'regular',
      deposit_percentage: depositTouched ? validDepositPct : 0,
      deposit_amount: depositTouched ? validDepositAmount : 0,
      // service_date = the day the work was actually performed. Optional;
      // null when the client didn't send it (e.g. older clients that haven't
      // been updated yet, or the "convert job → invoice" path). Column is
      // date type so we persist the YYYY-MM-DD string verbatim.
      service_date: body_service_date || null,
    };

    // Insert with retry for missing columns
    let row = { ...invoiceRow };
    let data, error;

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await supabase.from('invoices').insert(row).select().single();
      data = result.data;
      error = result.error;

      if (!error) break;

      const colMatch = error.message?.match(/column "([^"]+)" of relation "invoices" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'invoices'/);
      if (colMatch) {
        delete row[colMatch[1]];
        continue;
      }
      break;
    }

    if (error) {
      console.error('Invoice create error:', JSON.stringify(error));
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Auto-pin the invoiced aircraft to the customer's customer_aircraft
    // list so the CRM customer detail page (and the portal) shows it.
    // Fire-and-forget — never blocks the invoice response.
    if (tail_number && customer_email) {
      try {
        const { pinCustomerAircraft } = await import('@/lib/pin-customer-aircraft');
        pinCustomerAircraft(supabase, {
          detailerId: user.detailer_id || user.id,
          customerEmail: customer_email,
          customerName: customer_name,
          tailNumber: tail_number,
          aircraftModel: aircraft_model,
        }).catch((e) => console.error('[invoices] pin failed:', e?.message || e));
      } catch (e) {
        console.error('[invoices] pin import failed:', e?.message || e);
      }
    }

    return Response.json({ invoice: data }, { status: 201 });
  } catch (err) {
    console.error('Invoice POST error:', err);
    return Response.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
