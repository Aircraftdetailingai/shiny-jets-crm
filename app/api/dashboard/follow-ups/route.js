import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const now = new Date();
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Completed jobs 7+ days ago — candidates for review request
  const { data: completedJobs } = await supabase
    .from('quotes')
    .select('id, client_name, client_email, aircraft_model, tail_number, completed_at, status, share_link, feedback_requested_at')
    .eq('detailer_id', user.id)
    .eq('status', 'completed')
    .lte('completed_at', sevenDaysAgo.toISOString())
    .gte('completed_at', thirtyDaysAgo.toISOString())
    .order('completed_at', { ascending: false });

  const needsReview = (completedJobs || []).filter(j => !j.feedback_requested_at);

  // Recent completions (last 30 days)
  const { data: recentCompleted } = await supabase
    .from('quotes')
    .select('id, client_name, client_email, aircraft_model, tail_number, completed_at, status, share_link, customer_opened_at')
    .eq('detailer_id', user.id)
    .eq('status', 'completed')
    .gte('completed_at', thirtyDaysAgo.toISOString())
    .order('completed_at', { ascending: false })
    .limit(10);

  // Recurring services due in next 30 days
  const thirtyDaysOut = new Date(now); thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  const { data: recurring } = await supabase
    .from('customer_recommendations')
    .select('*, customers(name, email, company_name)')
    .eq('detailer_id', user.id)
    .lte('next_due_date', thirtyDaysOut.toISOString().split('T')[0])
    .gte('next_due_date', now.toISOString().split('T')[0])
    .order('next_due_date', { ascending: true })
    .limit(10);

  return Response.json({
    needsReview: needsReview || [],
    recentCompleted: recentCompleted || [],
    recurring: recurring || [],
  });
}
