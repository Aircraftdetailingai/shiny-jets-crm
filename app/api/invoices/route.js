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
      .eq('detailer_id', user.id)
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
    } = body;

    if (!customer_name || !customer_email || !line_items || !total) {
      return Response.json({ error: 'Missing required fields: customer_name, customer_email, line_items, total' }, { status: 400 });
    }

    // Check for existing invoice for this job — prevent duplicates
    if (job_id) {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, status, share_link, customer_email, total, created_at')
        .eq('job_id', job_id)
        .eq('detailer_id', user.id)
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
      detailer_id: user.id,
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

    return Response.json({ invoice: data }, { status: 201 });
  } catch (err) {
    console.error('Invoice POST error:', err);
    return Response.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
