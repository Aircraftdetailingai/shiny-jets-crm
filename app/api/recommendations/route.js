import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Generate smart recommendations based on data analysis
async function generateRecommendations(supabase, detailerId) {
  const recommendations = [];
  const now = new Date();

  // 1. Get customer stats
  const { data: customerStats } = await supabase
    .from('customer_stats')
    .select('*')
    .eq('detailer_id', detailerId);

  // 2. Get recent jobs
  const { data: recentJobs } = await supabase
    .from('quotes')
    .select('*')
    .eq('detailer_id', detailerId)
    .in('status', ['completed', 'paid'])
    .order('created_at', { ascending: false })
    .limit(100);

  // 3. Get job completion logs
  const { data: completionLogs } = await supabase
    .from('job_completion_logs')
    .select('*')
    .eq('detailer_id', detailerId)
    .order('created_at', { ascending: false })
    .limit(100);

  // 4. Get detailer info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('*')
    .eq('id', detailerId)
    .single();

  // RATE INCREASE ALERTS
  if (customerStats?.length > 0) {
    for (const customer of customerStats) {
      // Check if no rate increase in 12+ months
      if (customer.last_rate_increase_date) {
        const lastIncrease = new Date(customer.last_rate_increase_date);
        const monthsSinceIncrease = Math.floor((now - lastIncrease) / (1000 * 60 * 60 * 24 * 30));

        if (monthsSinceIncrease >= 12 && customer.total_jobs >= 3) {
          recommendations.push({
            type: 'rate_increase',
            priority: 8,
            title: 'Time for a Rate Increase',
            message: `You haven't raised rates for ${customer.customer_name || customer.customer_email} in ${monthsSinceIncrease} months. Consider a 10% increase - they've had ${customer.total_jobs} jobs totaling $${customer.total_revenue?.toFixed(0) || 0}.`,
            data: {
              customer_email: customer.customer_email,
              customer_name: customer.customer_name,
              months_since_increase: monthsSinceIncrease,
              total_revenue: customer.total_revenue,
              suggested_increase: 10,
            },
          });
        }
      } else if (customer.total_jobs >= 5) {
        // Never had a rate increase
        recommendations.push({
          type: 'rate_increase',
          priority: 7,
          title: 'Consider Rate Increase',
          message: `${customer.customer_name || customer.customer_email} has had ${customer.total_jobs} jobs but you've never raised their rates. It might be time.`,
          data: {
            customer_email: customer.customer_email,
            customer_name: customer.customer_name,
            total_jobs: customer.total_jobs,
          },
        });
      }

      // PROBLEM CUSTOMER ALERTS - High wait time
      if (customer.total_wait_time_minutes >= 120) {
        const waitHours = (customer.total_wait_time_minutes / 60).toFixed(1);
        const waitCost = (customer.total_wait_time_minutes / 60 * (detailer?.default_labor_rate || 75)).toFixed(0);

        recommendations.push({
          type: 'problem_customer',
          priority: 9,
          title: 'Wait Time Adding Up',
          message: `${customer.customer_name || customer.customer_email} has cost you ${waitHours} hours in wait time (~$${waitCost}). Consider adding a wait fee or discussing scheduling.`,
          data: {
            customer_email: customer.customer_email,
            customer_name: customer.customer_name,
            wait_time_hours: parseFloat(waitHours),
            estimated_cost: parseFloat(waitCost),
          },
        });
      }

      // PROBLEM CUSTOMER ALERTS - Frequent repositioning
      if (customer.total_repositioning_events >= 3) {
        recommendations.push({
          type: 'problem_customer',
          priority: 8,
          title: 'Repositioning Fee Opportunity',
          message: `${customer.customer_name || customer.customer_email}'s aircraft frequently needs repositioning (${customer.total_repositioning_events} times). Consider adding a $75-100 repositioning fee.`,
          data: {
            customer_email: customer.customer_email,
            customer_name: customer.customer_name,
            repositioning_count: customer.total_repositioning_events,
          },
        });
      }

      // PAYMENT TERMS ALERTS - Slow payers
      if (customer.avg_days_to_pay >= 30 && customer.total_jobs >= 3) {
        recommendations.push({
          type: 'payment_terms',
          priority: 7,
          title: 'Slow Payer Alert',
          message: `${customer.customer_name || customer.customer_email} averages ${customer.avg_days_to_pay?.toFixed(0)} days to pay. Consider requiring a 50% deposit for future jobs.`,
          data: {
            customer_email: customer.customer_email,
            customer_name: customer.customer_name,
            avg_days_to_pay: customer.avg_days_to_pay,
          },
        });
      }
    }
  }

  // TIME ACCURACY ALERTS
  if (completionLogs?.length >= 5) {
    const logsWithHours = completionLogs.filter(l => l.actual_hours && l.quoted_hours);
    if (logsWithHours.length >= 5) {
      const totalDiff = logsWithHours.reduce((sum, l) => sum + (l.actual_hours - l.quoted_hours), 0);
      const avgDiff = totalDiff / logsWithHours.length;

      if (avgDiff >= 0.5) {
        recommendations.push({
          type: 'time_accuracy',
          priority: 8,
          title: 'Jobs Taking Longer Than Quoted',
          message: `Your jobs average ${avgDiff.toFixed(1)} hours longer than quoted. Consider padding estimates by ${Math.ceil(avgDiff * 60)} minutes or reviewing your time estimates.`,
          data: {
            avg_overrun_hours: avgDiff,
            sample_size: logsWithHours.length,
          },
        });
      }
    }
  }

  // UPSELL ALERTS - Customers with limited services
  if (customerStats?.length > 0 && recentJobs?.length > 0) {
    // Find customers who only get basic services
    const customerServices = {};
    for (const job of recentJobs) {
      const email = job.customer_email;
      if (!email) continue;
      if (!customerServices[email]) customerServices[email] = new Set();

      const services = job.services || {};
      Object.keys(services).forEach(s => customerServices[email].add(s));
    }

    for (const [email, servicesSet] of Object.entries(customerServices)) {
      const services = Array.from(servicesSet);
      const customer = customerStats.find(c => c.customer_email === email);

      // If customer only gets exterior, suggest interior
      if (services.includes('exterior') && !services.includes('interior') && customer?.total_jobs >= 3) {
        recommendations.push({
          type: 'upsell',
          priority: 6,
          title: 'Interior Upsell Opportunity',
          message: `${customer?.customer_name || email} only gets exterior services. After ${customer?.total_jobs} jobs, they might be ready for interior detail - 70% of repeat customers add it.`,
          data: {
            customer_email: email,
            customer_name: customer?.customer_name,
            current_services: services,
          },
        });
      }
    }
  }

  // Sort by priority (highest first)
  recommendations.sort((a, b) => b.priority - a.priority);

  return recommendations.slice(0, 10); // Return top 10
}

// GET - Get recommendations for user
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get existing active recommendations
    const { data: existing, error: existingError } = await supabase
      .from('smart_recommendations')
      .select('*')
      .eq('detailer_id', user.id)
      .eq('acted_on', false)
      .eq('dismissed', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    // If we have recent recommendations (less than 24 hours old), return them
    const recentRecs = (existing || []).filter(r => {
      const age = Date.now() - new Date(r.created_at).getTime();
      return age < 24 * 60 * 60 * 1000; // 24 hours
    });

    if (recentRecs.length >= 3) {
      return Response.json({
        recommendations: recentRecs,
        generated: false,
      });
    }

    // Generate new recommendations
    const newRecs = await generateRecommendations(supabase, user.id);

    // Save new recommendations to database
    if (newRecs.length > 0) {
      const toInsert = newRecs.map(r => ({
        detailer_id: user.id,
        type: r.type,
        priority: r.priority,
        title: r.title,
        message: r.message,
        data: r.data,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expires in 7 days
      }));

      await supabase
        .from('smart_recommendations')
        .insert(toInsert);
    }

    // Fetch all active recommendations
    const { data: allRecs } = await supabase
      .from('smart_recommendations')
      .select('*')
      .eq('detailer_id', user.id)
      .eq('acted_on', false)
      .eq('dismissed', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);

    return Response.json({
      recommendations: allRecs || [],
      generated: true,
    });

  } catch (err) {
    console.error('Recommendations error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Act on or dismiss a recommendation
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { recommendationId, action } = await request.json();

    if (!recommendationId || !['act', 'dismiss'].includes(action)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Verify ownership
    const { data: rec } = await supabase
      .from('smart_recommendations')
      .select('*')
      .eq('id', recommendationId)
      .eq('detailer_id', user.id)
      .single();

    if (!rec) {
      return Response.json({ error: 'Recommendation not found' }, { status: 404 });
    }

    const updates = {};
    let pointsAwarded = 0;

    if (action === 'act') {
      updates.acted_on = true;
      updates.acted_on_at = new Date().toISOString();
      pointsAwarded = 50; // Award points for acting on recommendation
    } else {
      updates.dismissed = true;
      updates.dismissed_at = new Date().toISOString();
    }

    // Update recommendation
    await supabase
      .from('smart_recommendations')
      .update(updates)
      .eq('id', recommendationId);

    // Award points if acted on
    if (pointsAwarded > 0) {
      await supabase
        .from('points_history')
        .insert({
          detailer_id: user.id,
          points: pointsAwarded,
          reason: 'act_on_recommendation',
          metadata: { recommendationId, type: rec.type, title: rec.title },
        });

      // Update detailer points
      const { data: detailer } = await supabase
        .from('detailers')
        .select('total_points, lifetime_points')
        .eq('id', user.id)
        .single();

      await supabase
        .from('detailers')
        .update({
          total_points: (detailer?.total_points || 0) + pointsAwarded,
          lifetime_points: (detailer?.lifetime_points || 0) + pointsAwarded,
        })
        .eq('id', user.id);
    }

    return Response.json({
      success: true,
      action,
      pointsAwarded,
    });

  } catch (err) {
    console.error('Recommendation action error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
