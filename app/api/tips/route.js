import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Business tips database - ALL tips now link to real features
const BUSINESS_TIPS = [
  {
    id: 1,
    category: 'pricing',
    title: 'Review Your Pricing Quarterly',
    content: 'Material costs and demand change. A 5% increase on all quotes can significantly boost your annual revenue.',
    actionable: true,
    action: 'Update Service Rates',
    actionLink: '/settings/services',
    points: 20,
  },
  {
    id: 2,
    category: 'efficiency',
    title: 'Track Your Product Usage',
    content: 'Know exactly how much each job costs you in materials. Track inventory to price more accurately.',
    actionable: true,
    action: 'Manage Inventory',
    actionLink: '/products',
    points: 20,
  },
  {
    id: 3,
    category: 'marketing',
    title: 'Before & After Photos',
    content: 'Document every job. Great for social media and protects you from false damage claims.',
    actionable: true,
    action: 'Open Job Documentation',
    actionLink: '/calendar',
    featureKey: 'job_photos',
    points: 20,
  },
  {
    id: 4,
    category: 'customer_service',
    title: 'Follow Up After Every Job',
    content: 'A quick thank you message leads to repeat business and referrals.',
    actionable: true,
    action: 'View Recent Jobs',
    actionLink: '/quotes?status=completed',
    points: 20,
  },
  {
    id: 5,
    category: 'operations',
    title: 'Build Your Product Inventory',
    content: 'Track all your detailing products. Knowing exact costs helps you price profitably.',
    actionable: true,
    action: 'Set Up Inventory',
    actionLink: '/products',
    points: 20,
  },
  {
    id: 6,
    category: 'growth',
    title: 'Track Equipment ROI',
    content: 'Know which tools earn their keep. Track jobs per piece of equipment.',
    actionable: true,
    action: 'View Equipment',
    actionLink: '/equipment',
    points: 20,
  },
  {
    id: 7,
    category: 'pricing',
    title: 'Set Your Minimum Fee',
    content: 'Small jobs can lose money after travel. Set a minimum call out fee to stay profitable.',
    actionable: true,
    action: 'Set Minimum Fee',
    actionLink: '/settings',
    points: 20,
  },
  {
    id: 8,
    category: 'efficiency',
    title: 'Use the Calendar',
    content: 'Schedule jobs properly. Get reminders for documentation and follow-ups.',
    actionable: true,
    action: 'Open Calendar',
    actionLink: '/calendar',
    points: 20,
  },
  {
    id: 9,
    category: 'profitability',
    title: 'Know Your Hourly Rate',
    content: 'Set your internal labor cost to track true profitability on every job.',
    actionable: true,
    action: 'Set Labor Rate',
    actionLink: '/settings',
    points: 20,
  },
  {
    id: 10,
    category: 'customer_service',
    title: 'Embed Booking Widget',
    content: 'Let customers request quotes directly from your website 24/7.',
    actionable: true,
    action: 'Get Embed Code',
    actionLink: '/settings/embed',
    points: 20,
  },
  {
    id: 11,
    category: 'pricing',
    title: '4-Week Billing = 8% More Revenue',
    content: 'Bill recurring customers every 4 weeks instead of monthly. 13 billing cycles vs 12.',
    actionable: true,
    action: 'View Growth Tips',
    actionLink: '/growth',
    points: 20,
    proTip: true,
  },
  {
    id: 12,
    category: 'growth',
    title: 'Check Your Business Stats',
    content: 'Review your revenue, jobs completed, and average job value regularly.',
    actionable: true,
    action: 'View Dashboard',
    actionLink: '/dashboard',
    points: 20,
  },
  {
    id: 13,
    category: 'profitability',
    title: 'Configure Your Services',
    content: 'Set up your service menu with accurate hourly rates for faster quoting.',
    actionable: true,
    action: 'Configure Services',
    actionLink: '/settings/services',
    points: 20,
  },
  {
    id: 14,
    category: 'operations',
    title: 'Document Everything',
    content: 'Take photos before you start. Protects you from false damage claims.',
    actionable: true,
    action: 'Learn Documentation',
    actionLink: '/calendar',
    featureKey: 'job_photos',
    points: 20,
  },
];

// GET - Get today's tip or a specific tip
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const tipId = searchParams.get('id');

  // Get user's completed tips
  const { data: completedTips } = await supabase
    .from('points_history')
    .select('metadata')
    .eq('detailer_id', user.id)
    .eq('reason', 'complete_tip_task');

  const completedTipIds = (completedTips || [])
    .map(t => t.metadata?.tipId)
    .filter(Boolean);

  if (tipId) {
    const tip = BUSINESS_TIPS.find(t => t.id === parseInt(tipId));
    if (!tip) {
      return Response.json({ error: 'Tip not found' }, { status: 404 });
    }
    return Response.json({
      tip,
      completed: completedTipIds.includes(tip.id),
    });
  }

  // Get today's tip based on day of year
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const tipIndex = dayOfYear % BUSINESS_TIPS.length;
  const todaysTip = BUSINESS_TIPS[tipIndex];

  // Get all tips with completion status
  const allTips = BUSINESS_TIPS.map(tip => ({
    ...tip,
    completed: completedTipIds.includes(tip.id),
  }));

  return Response.json({
    todaysTip: {
      ...todaysTip,
      completed: completedTipIds.includes(todaysTip.id),
    },
    allTips,
    completedCount: completedTipIds.length,
    totalTips: BUSINESS_TIPS.length,
  });
}

// POST - Mark tip as completed
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const { tipId } = await request.json();

  const tip = BUSINESS_TIPS.find(t => t.id === tipId);
  if (!tip) {
    return Response.json({ error: 'Tip not found' }, { status: 404 });
  }

  // Check if already completed
  const { data: existing } = await supabase
    .from('points_history')
    .select('id')
    .eq('detailer_id', user.id)
    .eq('reason', 'complete_tip_task')
    .contains('metadata', { tipId })
    .limit(1);

  if (existing?.length > 0) {
    return Response.json({ error: 'Tip already completed', points: 0 });
  }

  // Award points
  const points = tip.points || 20;

  await supabase
    .from('points_history')
    .insert({
      detailer_id: user.id,
      points,
      reason: 'complete_tip_task',
      metadata: { tipId, tipTitle: tip.title },
    });

  // Update totals
  const { data: detailer } = await supabase
    .from('detailers')
    .select('total_points, lifetime_points')
    .eq('id', user.id)
    .single();

  await supabase
    .from('detailers')
    .update({
      total_points: (detailer?.total_points || 0) + points,
      lifetime_points: (detailer?.lifetime_points || 0) + points,
    })
    .eq('id', user.id);

  return Response.json({
    success: true,
    points,
    tipId,
  });
}
