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
      .eq('detailer_id', user.id)
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

    // Verify ownership
    const { data: existing, error: fetchError } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', id)
      .eq('detailer_id', user.id)
      .single();

    if (fetchError || !existing) {
      return Response.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // Only allow updating safe fields
    const allowedFields = [
      'status', 'notes', 'customer_name', 'customer_email', 'customer_phone',
      'aircraft_model', 'tail_number', 'line_items', 'total', 'subtotal',
      'net_terms', 'due_date', 'issued_date', 'amount_paid', 'balance_due',
      'discount_type', 'discount_value', 'discount_amount', 'discount_reason',
    ];

    const updates = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Update with retry for missing columns
    let updateData = { ...updates };
    let data, error;

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', id)
        .eq('detailer_id', user.id)
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
