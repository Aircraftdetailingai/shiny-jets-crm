import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendInvoiceEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Single invoice
export async function GET(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const { id } = await params;

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    if (data.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}

// PUT - Update invoice (mark paid, update notes)
export async function PUT(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('detailer_id')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    if (invoice.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Build update object
    const updates = {};
    if (body.status) {
      updates.status = body.status;
      if (body.status === 'paid' && !body.paid_at) {
        updates.paid_at = new Date().toISOString();
      }
    }
    if (body.paid_at) updates.paid_at = body.paid_at;
    if (body.payment_method) updates.payment_method = body.payment_method;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.manual_payment_note) updates.manual_payment_note = body.manual_payment_note;
    if (body.status === 'paid') {
      updates.amount_paid = body.amount_paid || invoice.total || 0;
      updates.balance_due = 0;
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // When marking invoice as paid, also update the linked quote
    if (body.status === 'paid' && data?.quote_id) {
      try {
        await supabase.from('quotes').update({
          status: 'paid',
          paid_at: updates.paid_at || new Date().toISOString(),
          amount_paid: data.total || 0,
          balance_due: 0,
        }).eq('id', data.quote_id);
      } catch (e) { console.error('Failed to sync quote status:', e); }
    }

    return Response.json({ invoice: data });
  } catch (err) {
    return Response.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}

// POST - Email invoice to customer
export async function POST(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const { id } = await params;

    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    if (invoice.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    if (!invoice.customer_email) {
      return Response.json({ error: 'No customer email on invoice' }, { status: 400 });
    }

    const result = await sendInvoiceEmail({ invoice });

    if (!result.success) {
      return Response.json({ error: result.error || 'Failed to send email' }, { status: 500 });
    }

    // Update invoice as sent
    await supabase
      .from('invoices')
      .update({ emailed_at: new Date().toISOString() })
      .eq('id', id);

    return Response.json({ success: true });
  } catch (err) {
    console.error('Invoice email error:', err);
    return Response.json({ error: 'Failed to email invoice' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const { id } = await params;

    const { data: invoice } = await supabase
      .from('invoices')
      .select('detailer_id')
      .eq('id', id)
      .single();

    if (!invoice) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    if (invoice.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    await supabase.from('invoices').delete().eq('id', id);

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Failed to delete invoice' }, { status: 500 });
  }
}
