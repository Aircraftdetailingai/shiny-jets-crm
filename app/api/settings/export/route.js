import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { normalizePlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

function escCSV(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCSV(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escCSV(row[h])).join(','));
  }
  return lines.join('\n');
}

// GET - Export all data as individual CSVs in a single JSON response
// The client assembles them into a ZIP
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  // Check plan
  const { data: detailer } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', user.id)
    .single();

  const plan = detailer?.plan || 'free';
  if (normalizePlan(plan) === 'free') {
    return Response.json({
      error: 'Data export is included with Lite ($39.95/mo) and Business.',
      upgrade: true,
    }, { status: 403 });
  }

  // Fetch all data in parallel
  const [customersRes, quotesRes, servicesRes, productsRes] = await Promise.all([
    supabase.from('customers').select('name, email, phone, company_name, tags, notes, created_at')
      .eq('detailer_id', user.detailer_id || user.id).order('name'),
    supabase.from('quotes').select('client_name, client_email, aircraft_type, aircraft_model, tail_number, total_price, total_hours, status, notes, created_at')
      .eq('detailer_id', user.detailer_id || user.id).order('created_at', { ascending: false }),
    supabase.from('services').select('name, description, hourly_rate, category, sort_order')
      .eq('detailer_id', user.detailer_id || user.id).order('sort_order'),
    supabase.from('products').select('name, brand, category, unit, size, cost_per_unit, quantity, reorder_level, supplier, notes')
      .eq('detailer_id', user.detailer_id || user.id).order('name'),
  ]);

  const customers = (customersRes.data || []).map(c => ({
    ...c,
    tags: Array.isArray(c.tags) ? c.tags.join('; ') : c.tags || '',
    created_at: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
  }));

  const quotes = (quotesRes.data || []).map(q => ({
    ...q,
    total_price: q.total_price || 0,
    total_hours: q.total_hours || 0,
    created_at: q.created_at ? new Date(q.created_at).toLocaleDateString() : '',
  }));

  const services = servicesRes.data || [];
  const products = productsRes.data || [];

  // Build CSVs
  const files = {
    'customers.csv': toCSV(
      ['name', 'email', 'phone', 'company_name', 'tags', 'notes', 'created_at'],
      customers
    ),
    'quotes.csv': toCSV(
      ['client_name', 'client_email', 'aircraft_type', 'aircraft_model', 'tail_number', 'total_price', 'total_hours', 'status', 'notes', 'created_at'],
      quotes
    ),
    'services.csv': toCSV(
      ['name', 'description', 'hourly_rate', 'category', 'sort_order'],
      services
    ),
    'products.csv': toCSV(
      ['name', 'brand', 'category', 'unit', 'size', 'cost_per_unit', 'quantity', 'reorder_level', 'supplier', 'notes'],
      products
    ),
  };

  return Response.json({
    files,
    counts: {
      customers: customers.length,
      quotes: quotes.length,
      services: services.length,
      products: products.length,
    },
  });
}
