import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { nanoid } from 'nanoid';
import { PLATFORM_FEES } from '@/lib/pricing-tiers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function generateInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const seq = nanoid(4).toUpperCase();
  return `INV-${y}${m}-${seq}`;
}

// GET - List all invoices for the detailer
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('detailer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Invoices fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ invoices: data || [] });
  } catch (err) {
    console.error('Invoices GET error:', err);
    return Response.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// POST - Create invoice from a quote
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const { quote_id } = body;

    if (!quote_id) {
      return Response.json({ error: 'Quote ID required' }, { status: 400 });
    }

    // Fetch the quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quote_id)
      .eq('detailer_id', user.id)
      .single();

    if (quoteError || !quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Check if invoice already exists for this quote
    const { data: existing } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('quote_id', quote_id)
      .single();

    if (existing) {
      return Response.json({ error: 'Invoice already exists for this quote', invoice: existing }, { status: 409 });
    }

    // Fetch detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('name, email, company, phone, plan')
      .eq('id', user.id)
      .single();

    // Calculate fee breakdown
    const plan = detailer?.plan || 'free';
    const feeRate = PLATFORM_FEES[plan] || PLATFORM_FEES.free;
    const subtotal = parseFloat(quote.total_price) || 0;
    const platformFee = Math.round(subtotal * feeRate * 100) / 100;

    const invoiceNumber = generateInvoiceNumber();

    const invoiceRow = {
      detailer_id: user.id,
      quote_id: quote.id,
      invoice_number: invoiceNumber,
      status: quote.status === 'paid' || quote.status === 'completed' ? 'paid' : 'unpaid',
      // Customer info
      customer_name: quote.client_name || quote.customer_name || '',
      customer_email: quote.client_email || quote.customer_email || '',
      customer_phone: quote.client_phone || quote.customer_phone || '',
      customer_company: quote.customer_company || quote.company_name || '',
      // Detailer info
      detailer_name: detailer?.name || '',
      detailer_email: detailer?.email || '',
      detailer_company: detailer?.company || '',
      detailer_phone: detailer?.phone || '',
      // Job info
      aircraft: quote.aircraft_model || quote.aircraft_type || '',
      line_items: quote.line_items || [],
      addon_fees: quote.addon_fees || [],
      subtotal,
      platform_fee: platformFee,
      platform_fee_rate: feeRate,
      total: subtotal,
      notes: quote.notes || '',
      airport: quote.airport || '',
      paid_at: quote.paid_at || null,
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
