import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get single invoice by id (owner auth)
export async function GET(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { id } = await params;

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('detailer_id', user.detailer_id || user.id)
      .single();

    if (error || !data) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return Response.json({ invoice: data });
  } catch (err) {
    console.error('Invoice GET error:', err);
    return Response.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}

// PATCH - Update invoice (owner auth)
export async function PATCH(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { id } = await params;
    const body = await request.json();

    // Verify ownership and read current status so we can make status-transition
    // decisions (e.g. revert 'viewed' → 'sent' when the invoice is edited).
    const { data: existing, error: fetchError } = await supabase
      .from('invoices')
      .select('id, status, line_items, addon_total, discount_amount, amount_paid')
      .eq('id', id)
      .eq('detailer_id', user.detailer_id || user.id)
      .single();

    if (fetchError || !existing) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only allow updating safe fields
    const allowedFields = [
      'status', 'notes', 'customer_name', 'customer_email', 'customer_phone',
      'aircraft_model', 'tail_number', 'line_items', 'total', 'subtotal',
      'addon_fees', 'addon_total', 'staff_count', 'job_days',
      'net_terms', 'due_date', 'issued_date', 'amount_paid', 'balance_due',
      'discount_type', 'discount_value', 'discount_amount', 'discount_reason',
      'show_mailing_address', 'show_ach_info',
      'booking_mode', 'deposit_percentage', 'deposit_amount',
    ];

    const updates = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    // Authoritative money math: whenever any input changes, recompute the three
    // derived fields server-side so client-sent (or omitted) values can't drift.
    // The edit UI sends subtotal/total but never balance_due, so balance_due was
    // going stale (e.g. an edit that applied a discount left balance_due pinned).
    const touchesMoney = ['line_items', 'addon_total', 'discount_amount', 'amount_paid']
      .some((k) => updates[k] !== undefined);
    if (touchesMoney) {
      const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
      const pick = (k) => (updates[k] !== undefined ? updates[k] : existing[k]);
      const liArr = Array.isArray(pick('line_items')) ? pick('line_items') : [];
      const subtotal = r2(liArr.reduce((s, li) => s + (parseFloat(li?.price) || 0), 0));
      const addonTotal = r2(parseFloat(pick('addon_total')) || 0);
      const discountAmt = r2(parseFloat(pick('discount_amount')) || 0);
      const amountPaid = r2(parseFloat(pick('amount_paid')) || 0);
      const total = Math.max(0, r2(subtotal + addonTotal - discountAmt));
      updates.subtotal = subtotal;
      updates.total = total;
      updates.balance_due = r2(total - amountPaid);
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Tier gate + validation if deposit fields are being touched. Free-tier
    // detailers can still PATCH non-deposit fields freely; only block when
    // they try to enable a deposit.
    const depositTouched = updates.booking_mode !== undefined
      || updates.deposit_percentage !== undefined
      || updates.deposit_amount !== undefined;
    if (depositTouched) {
      const { data: detailerRow } = await supabase
        .from('detailers')
        .select('plan, is_admin')
        .eq('id', user.id)
        .single();
      const plan = detailerRow?.plan || 'free';
      const isAdmin = detailerRow?.is_admin === true;
      const wantsDeposit = updates.booking_mode === 'pay_to_book'
        || (parseFloat(updates.deposit_percentage) || 0) > 0
        || (parseFloat(updates.deposit_amount) || 0) > 0;
      if (wantsDeposit && plan === 'free' && !isAdmin) {
        return Response.json({ error: 'Deposits require a Pro plan or higher.' }, { status: 403 });
      }
      if (updates.booking_mode != null && !['regular', 'pay_to_book'].includes(updates.booking_mode)) {
        return Response.json({ error: 'Invalid booking_mode (expected regular or pay_to_book).' }, { status: 400 });
      }
      if (updates.deposit_percentage != null) {
        const pct = parseFloat(updates.deposit_percentage);
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          return Response.json({ error: 'deposit_percentage must be between 0 and 100.' }, { status: 400 });
        }
        updates.deposit_percentage = pct;
      }
      if (updates.deposit_amount != null) {
        const amt = parseFloat(updates.deposit_amount);
        if (Number.isNaN(amt) || amt < 0) {
          return Response.json({ error: 'deposit_amount must be >= 0.' }, { status: 400 });
        }
        const totalForCheck = updates.total != null ? parseFloat(updates.total) : null;
        if (totalForCheck != null && totalForCheck > 0 && amt > totalForCheck) {
          return Response.json({ error: 'deposit_amount cannot exceed total.' }, { status: 400 });
        }
        updates.deposit_amount = amt;
      }
    }

    // Editing an invoice the customer has already viewed invalidates their view;
    // revert to 'sent' so the updated version triggers a fresh view event.
    // Other statuses pass through unchanged except paid, which gets a warning.
    if (existing.status === 'viewed') {
      updates.status = 'sent';
    }
    if (existing.status === 'paid') {
      console.warn('[invoice/PATCH] editing a paid invoice is unusual:', id);
    }

    // Update with retry for missing columns
    let updateData = { ...updates };
    let data, error;

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', id)
        .eq('detailer_id', user.detailer_id || user.id)
        .select()
        .single();

      data = result.data;
      error = result.error;

      if (!error) break;

      const colMatch = error.message?.match(/column "([^"]+)" of relation "invoices" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'invoices'/);
      if (colMatch) {
        delete updateData[colMatch[1]];
        continue;
      }
      break;
    }

    if (error) {
      console.error('Invoice update error:', JSON.stringify(error));
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ invoice: data });
  } catch (err) {
    console.error('Invoice PATCH error:', err);
    return Response.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}
