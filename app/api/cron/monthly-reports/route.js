import { createClient } from '@supabase/supabase-js';
import { sendMonthlyReportEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

const REVENUE_STATUSES = ['paid', 'approved', 'accepted', 'scheduled', 'in_progress', 'completed'];

export async function POST(request) {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = getSupabase();

  // Find detailers with monthly report enabled
  const { data: detailers, error: dErr } = await supabase
    .from('detailers')
    .select('id, email, name, company, notification_settings, plan');

  if (dErr || !detailers) {
    console.log('[monthly-reports] Failed to fetch detailers:', dErr?.message);
    return Response.json({ error: 'Failed to fetch detailers' }, { status: 500 });
  }

  const optedIn = detailers.filter(d =>
    d.email && d.notification_settings?.monthlyReportEnabled
  );

  console.log(`[monthly-reports] ${optedIn.length} detailers opted in`);

  // Previous month range
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const monthLabel = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  let sent = 0;
  let failed = 0;

  for (const detailer of optedIn) {
    try {
      // Fetch quotes for previous month
      const { data: quotes } = await supabase
        .from('quotes')
        .select('total_price, status, paid_at, completed_at, created_at, client_name, aircraft_model, aircraft_type')
        .eq('detailer_id', detailer.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      const allQuotes = quotes || [];
      const paidQuotes = allQuotes.filter(q => REVENUE_STATUSES.includes(q.status));

      const PLATFORM_FEES = { free: 0.05, pro: 0.02, business: 0.01, enterprise: 0.00 };
      const feeRate = PLATFORM_FEES[detailer.plan] || 0.05;

      const totalRevenue = paidQuotes.reduce((s, q) => s + (parseFloat(q.total_price) || 0), 0);
      const totalFees = Math.round(totalRevenue * feeRate * 100) / 100;
      const netRevenue = totalRevenue - totalFees;

      const result = await sendMonthlyReportEmail({
        detailer,
        monthLabel,
        stats: {
          totalRevenue,
          totalFees,
          netRevenue,
          jobCount: paidQuotes.length,
          totalQuotes: allQuotes.length,
          avgJobValue: paidQuotes.length > 0 ? totalRevenue / paidQuotes.length : 0,
        },
      });

      if (result?.success) sent++;
      else failed++;
    } catch (e) {
      console.log(`[monthly-reports] Error for ${detailer.id}:`, e.message);
      failed++;
    }
  }

  console.log(`[monthly-reports] Complete: ${sent} sent, ${failed} failed`);
  return Response.json({ success: true, sent, failed, total: optedIn.length });
}
