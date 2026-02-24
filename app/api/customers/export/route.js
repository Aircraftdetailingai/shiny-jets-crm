import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// GET - Export customer list as CSV (Pro+ only)
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  // Check plan
  const { data: detailer } = await supabase
    .from('detailers')
    .select('plan')
    .eq('id', user.id)
    .single();

  const plan = detailer?.plan || 'free';
  if (plan === 'free') {
    return Response.json({
      error: 'Upgrade to Pro to export your customer list',
      upgrade: true,
    }, { status: 403 });
  }

  // Get all customers
  let customers = [];
  try {
    const { data } = await supabase
      .from('customers')
      .select('name, email, phone, company_name, notes, created_at')
      .eq('detailer_id', user.id)
      .order('name', { ascending: true });
    customers = data || [];
  } catch (e) {
    // Fall back to quotes-based customer list
    const { data: quotes } = await supabase
      .from('quotes')
      .select('client_name, client_email, client_phone')
      .eq('detailer_id', user.id)
      .not('client_email', 'is', null);

    const seen = new Map();
    for (const q of (quotes || [])) {
      if (q.client_email && !seen.has(q.client_email.toLowerCase())) {
        seen.set(q.client_email.toLowerCase(), {
          name: q.client_name || '',
          email: q.client_email,
          phone: q.client_phone || '',
          company_name: '',
          notes: '',
        });
      }
    }
    customers = Array.from(seen.values());
  }

  // Build CSV
  const escCSV = (v) => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = 'name,email,phone,company,notes';
  const rows = customers.map(c =>
    [c.name, c.email, c.phone, c.company_name, c.notes].map(escCSV).join(',')
  );
  const csv = [header, ...rows].join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="customers-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
