import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getUser(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth_token')?.value;
    if (authCookie) {
      const user = await verifyToken(authCookie);
      if (user) return user;
    }
  } catch (e) {}
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }
  return null;
}

// POST - Complete a job with detailed logging
export async function POST(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const {
      quote_id,
      actual_hours,
      service_hours,
      wait_time_minutes = 0,
      repositioning_needed = false,
      customer_late = false,
      products_used = [],
      product_cost = 0,
      notes = '',
      issues = '',
    } = body;

    if (!quote_id) {
      return Response.json({ error: 'Quote ID required' }, { status: 400 });
    }

    // Get the quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quote_id)
      .eq('detailer_id', user.id)
      .single();

    if (quoteError || !quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Create job completion log
    const { data: log, error: logError } = await supabase
      .from('job_completion_logs')
      .insert({
        quote_id,
        detailer_id: user.id,
        customer_email: quote.customer_email,
        actual_hours: parseFloat(actual_hours) || quote.total_hours,
        quoted_hours: quote.total_hours,
        wait_time_minutes: parseInt(wait_time_minutes) || 0,
        repositioning_needed,
        customer_late,
        products_used,
        product_cost: parseFloat(product_cost) || 0,
        notes,
        issues,
      })
      .select()
      .single();

    if (logError) {
      console.error('Failed to create completion log:', logError);
      // Continue anyway - don't fail the completion
    }

    // Log per-service hours if provided
    if (service_hours && Array.isArray(service_hours) && service_hours.length > 0) {
      try {
        let aircraftModel = '';

        if (quote.aircraft_id) {
          const { data: aircraft } = await supabase
            .from('aircraft')
            .select('model')
            .eq('id', quote.aircraft_id)
            .single();

          if (aircraft) {
            aircraftModel = aircraft.model;
          }
        }

        const hoursEntries = service_hours.map(sh => ({
          quote_id,
          detailer_id: user.id,
          aircraft_id: quote.aircraft_id || null,
          aircraft_model: aircraftModel,
          service_type: sh.hours_field || 'ext_wash_hours',
          actual_hours: parseFloat(sh.actual_hours) || 0,
        }));

        await supabase.from('hours_log').insert(hoursEntries);
      } catch (e) {
        console.error('Failed to log service hours:', e);
      }
    }

    // Update quote status to completed
    await supabase
      .from('quotes')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        actual_hours: parseFloat(actual_hours) || quote.total_hours,
        product_cost: parseFloat(product_cost) || 0,
        completion_notes: notes,
      })
      .eq('id', quote_id);

    // Update customer stats
    if (quote.customer_email) {
      await updateCustomerStats(supabase, user.id, quote, {
        wait_time_minutes,
        repositioning_needed,
        customer_late,
      });
    }

    // Deduct products from inventory
    if (products_used && products_used.length > 0) {
      for (const usage of products_used) {
        if (usage.product_id && usage.amount) {
          // Get current quantity
          const { data: product } = await supabase
            .from('products')
            .select('current_quantity')
            .eq('id', usage.product_id)
            .eq('detailer_id', user.id)
            .single();

          if (product) {
            const newQuantity = Math.max(0, (product.current_quantity || 0) - parseFloat(usage.amount));
            await supabase
              .from('products')
              .update({
                current_quantity: newQuantity,
                updated_at: new Date().toISOString(),
              })
              .eq('id', usage.product_id)
              .eq('detailer_id', user.id);
          }
        }
      }
    }

    // Increment equipment job counts if equipment_used is provided
    const { equipment_used = [] } = body;
    if (equipment_used && equipment_used.length > 0) {
      for (const equipmentId of equipment_used) {
        const { data: equipment } = await supabase
          .from('equipment')
          .select('jobs_completed')
          .eq('id', equipmentId)
          .eq('detailer_id', user.id)
          .single();

        if (equipment) {
          await supabase
            .from('equipment')
            .update({
              jobs_completed: (equipment.jobs_completed || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', equipmentId)
            .eq('detailer_id', user.id);
        }
      }
    }

    // Award points for tracking data
    let totalPoints = 0;
    const pointReasons = [];

    // Base points for completing a job
    totalPoints += 10;
    pointReasons.push({ reason: 'complete_job', points: 10 });

    // Bonus points for logging wait time
    if (wait_time_minutes > 0) {
      totalPoints += 10;
      pointReasons.push({ reason: 'log_wait_time', points: 10 });
    }

    // Bonus points for logging repositioning
    if (repositioning_needed) {
      totalPoints += 10;
      pointReasons.push({ reason: 'log_repositioning', points: 10 });
    }

    // Bonus points for full survey (notes + products)
    if (notes && products_used.length > 0) {
      totalPoints += 20;
      pointReasons.push({ reason: 'complete_job_survey', points: 20 });
    }

    // Award points
    if (totalPoints > 0) {
      await supabase
        .from('points_history')
        .insert({
          detailer_id: user.id,
          points: totalPoints,
          reason: 'job_completion',
          metadata: {
            quote_id,
            breakdown: pointReasons,
          },
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
          total_points: (detailer?.total_points || 0) + totalPoints,
          lifetime_points: (detailer?.lifetime_points || 0) + totalPoints,
        })
        .eq('id', user.id);
    }

    return Response.json({
      success: true,
      log,
      pointsAwarded: totalPoints,
      pointBreakdown: pointReasons,
    });

  } catch (err) {
    console.error('Job completion error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// Update customer statistics
async function updateCustomerStats(supabase, detailerId, quote, logData) {
  const customerEmail = quote.customer_email;
  if (!customerEmail) return;

  // Get existing stats
  const { data: existing } = await supabase
    .from('customer_stats')
    .select('*')
    .eq('detailer_id', detailerId)
    .eq('customer_email', customerEmail)
    .single();

  if (existing) {
    // Update existing stats
    const updates = {
      total_jobs: (existing.total_jobs || 0) + 1,
      total_revenue: (existing.total_revenue || 0) + (quote.total_price || 0),
      total_wait_time_minutes: (existing.total_wait_time_minutes || 0) + (logData.wait_time_minutes || 0),
      last_job_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (logData.repositioning_needed) {
      updates.total_repositioning_events = (existing.total_repositioning_events || 0) + 1;
    }

    if (logData.customer_late) {
      updates.total_late_arrivals = (existing.total_late_arrivals || 0) + 1;
    }

    // Calculate avg days to pay if quote has payment date
    if (quote.paid_at && quote.sent_at) {
      const sentDate = new Date(quote.sent_at);
      const paidDate = new Date(quote.paid_at);
      const daysToPayThisJob = Math.floor((paidDate - sentDate) / (1000 * 60 * 60 * 24));

      const prevTotal = (existing.avg_days_to_pay || 0) * (existing.total_jobs || 0);
      const newTotal = prevTotal + daysToPayThisJob;
      updates.avg_days_to_pay = newTotal / updates.total_jobs;
    }

    await supabase
      .from('customer_stats')
      .update(updates)
      .eq('id', existing.id);
  } else {
    // Create new stats
    await supabase
      .from('customer_stats')
      .insert({
        detailer_id: detailerId,
        customer_email: customerEmail,
        customer_name: quote.customer_name,
        total_jobs: 1,
        total_revenue: quote.total_price || 0,
        total_wait_time_minutes: logData.wait_time_minutes || 0,
        total_repositioning_events: logData.repositioning_needed ? 1 : 0,
        total_late_arrivals: logData.customer_late ? 1 : 0,
        first_job_date: new Date().toISOString(),
        last_job_date: new Date().toISOString(),
      });
  }
}
