import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - List scheduled quotes
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data, error } = await supabase
      .from('scheduled_quotes')
      .select('*')
      .eq('detailer_id', user.id)
      .is('cancelled_at', null)
      .order('send_at', { ascending: true });

    if (error) {
      console.error('Scheduled quotes fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ scheduled: data || [] });
  } catch (err) {
    console.error('Scheduled quotes GET error:', err);
    return Response.json({ error: 'Failed to fetch scheduled quotes' }, { status: 500 });
  }
}

// POST - Schedule a quote for future send
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const { quote_id, send_at, client_name, client_email, client_phone, client_company, customer_id, airport } = body;

    if (!quote_id || !send_at) {
      return Response.json({ error: 'Quote ID and send time are required' }, { status: 400 });
    }

    // Verify quote exists and belongs to user
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select('id, detailer_id, aircraft_model, aircraft_type, total_price, share_link, status')
      .eq('id', quote_id)
      .single();

    if (qErr || !quote) return Response.json({ error: 'Quote not found' }, { status: 404 });
    if (quote.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const sendTime = new Date(send_at);
    if (sendTime <= new Date()) {
      return Response.json({ error: 'Send time must be in the future' }, { status: 400 });
    }

    const row = {
      detailer_id: user.id,
      quote_id,
      send_at: sendTime.toISOString(),
      client_name: client_name || '',
      client_email: client_email || '',
      client_phone: client_phone || null,
      client_company: client_company || null,
      customer_id: customer_id || null,
      airport: airport || null,
      aircraft: quote.aircraft_model || quote.aircraft_type || '',
      total_price: parseFloat(quote.total_price) || 0,
      status: 'pending',
    };

    // Insert with retry for missing columns
    let insertRow = { ...row };
    let data, error;

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = await supabase.from('scheduled_quotes').insert(insertRow).select().single();
      data = result.data;
      error = result.error;

      if (!error) break;

      const colMatch = error.message?.match(/column "([^"]+)" of relation "scheduled_quotes" does not exist/)
        || error.message?.match(/Could not find the '([^']+)' column of 'scheduled_quotes'/);
      if (colMatch) {
        delete insertRow[colMatch[1]];
        continue;
      }
      break;
    }

    if (error) {
      console.error('Scheduled quote create error:', JSON.stringify(error));
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Update quote status to 'scheduled'
    await supabase
      .from('quotes')
      .update({ status: 'scheduled', scheduled_date: sendTime.toISOString() })
      .eq('id', quote_id);

    return Response.json({ scheduled: data }, { status: 201 });
  } catch (err) {
    console.error('Scheduled quotes POST error:', err);
    return Response.json({ error: 'Failed to schedule quote' }, { status: 500 });
  }
}

// PUT - Update a scheduled quote (reschedule or edit)
export async function PUT(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const body = await request.json();
    const { id, send_at, client_name, client_email, client_phone, client_company } = body;

    if (!id) return Response.json({ error: 'Scheduled quote ID required' }, { status: 400 });

    const { data: existing } = await supabase
      .from('scheduled_quotes')
      .select('detailer_id, status')
      .eq('id', id)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    if (existing.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });
    if (existing.status === 'sent') return Response.json({ error: 'Already sent' }, { status: 400 });

    const updates = { updated_at: new Date().toISOString() };
    if (send_at) {
      const sendTime = new Date(send_at);
      if (sendTime <= new Date()) return Response.json({ error: 'Send time must be in the future' }, { status: 400 });
      updates.send_at = sendTime.toISOString();
    }
    if (client_name !== undefined) updates.client_name = client_name;
    if (client_email !== undefined) updates.client_email = client_email;
    if (client_phone !== undefined) updates.client_phone = client_phone;
    if (client_company !== undefined) updates.client_company = client_company;

    const { data, error } = await supabase
      .from('scheduled_quotes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ scheduled: data });
  } catch (err) {
    return Response.json({ error: 'Failed to update' }, { status: 500 });
  }
}

// DELETE - Cancel a scheduled quote
export async function DELETE(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return Response.json({ error: 'ID required' }, { status: 400 });

    const { data: existing } = await supabase
      .from('scheduled_quotes')
      .select('detailer_id, quote_id, status')
      .eq('id', id)
      .single();

    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 });
    if (existing.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    if (existing.status === 'sent') {
      return Response.json({ error: 'Cannot cancel a sent quote' }, { status: 400 });
    }

    // Mark as cancelled
    await supabase
      .from('scheduled_quotes')
      .update({ cancelled_at: new Date().toISOString(), status: 'cancelled' })
      .eq('id', id);

    // Revert quote status to draft
    if (existing.quote_id) {
      await supabase
        .from('quotes')
        .update({ status: 'draft', scheduled_date: null })
        .eq('id', existing.quote_id);
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Failed to cancel' }, { status: 500 });
  }
}
