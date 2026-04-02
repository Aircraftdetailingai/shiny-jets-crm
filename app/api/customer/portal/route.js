import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCustomer(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret');
    const { payload } = await jwtVerify(authHeader.slice(7), secret);
    if (payload.type !== 'customer') return null;
    return payload;
  } catch { return null; }
}

// GET — customer portal data
export async function GET(request) {
  const customer = await getCustomer(request);
  if (!customer) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();

  // Get account info
  const { data: account } = await supabase.from('customer_accounts').select('id, email, name, phone, company, stripe_customer_id').eq('id', customer.id).single();

  // Get aircraft
  const { data: aircraft } = await supabase.from('customer_aircraft').select('*').eq('customer_account_id', customer.id).order('created_at', { ascending: false });

  // Get job history (all quotes linked to this account or email)
  const { data: jobs } = await supabase.from('quotes')
    .select('id, aircraft_model, tail_number, total_price, status, completed_at, scheduled_date, created_at, share_link, detailer_id, detailers(company)')
    .or(`customer_account_id.eq.${customer.id},client_email.eq.${customer.email}`)
    .order('created_at', { ascending: false })
    .limit(20);

  // Get recommendations for this customer
  const { data: recommendations } = await supabase.from('customer_recommendations')
    .select('*')
    .eq('customer_id', customer.id)
    .order('next_due_date', { ascending: true });

  return Response.json({
    account: account || {},
    aircraft: aircraft || [],
    jobs: jobs || [],
    recommendations: recommendations || [],
  });
}
