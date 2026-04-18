import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { logActivity, ACTIVITY } from '@/lib/activity-log';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Complete a job with detailed logging
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
      product_estimates = [],
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
        product_estimates,
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
        let aircraftMake = '';

        if (quote.aircraft_id) {
          const { data: aircraft } = await supabase
            .from('aircraft')
            .select('model, manufacturer')
            .eq('id', quote.aircraft_id)
            .single();

          if (aircraft) {
            aircraftModel = aircraft.model;
            aircraftMake = aircraft.manufacturer || '';
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

      // Track hours contributions (crowdsourced data)
      try {
        const detailerHash = createHash('sha256').update(user.id).digest('hex');
        const contributionMake = aircraftMake || quote.aircraft_make || '';
        const contributionModel = aircraftModel || quote.aircraft_model || '';

        // Known service_type -> aircraft_hours column mapping
        const SERVICE_TO_COLUMN = {
          ext_wash_hours: 'maintenance_wash_hrs',
          int_detail_hours: null, // no direct match in aircraft_hours
          leather_hours: 'leather_hrs',
          carpet_hours: 'carpet_hrs',
          wax_hours: 'wax_hrs',
          polish_hours: 'one_step_polish_hrs',
          ceramic_hours: 'ceramic_coating_hrs',
          brightwork_hours: null,
        };

        // Fetch aircraft_hours defaults for this make/model
        let aircraftHoursDefaults = null;
        if (contributionMake && contributionModel) {
          const { data: ahData } = await supabase
            .from('aircraft_hours')
            .select('*')
            .ilike('make', contributionMake)
            .ilike('model', contributionModel)
            .limit(1)
            .single();
          aircraftHoursDefaults = ahData;
        }

        for (const sh of service_hours) {
          const serviceType = sh.hours_field || 'ext_wash_hours';
          const actualHrs = parseFloat(sh.actual_hours) || 0;
          if (actualHrs <= 0) continue;

          const column = SERVICE_TO_COLUMN[serviceType];

          if (column !== undefined) {
            // Known service type -> insert into hours_contributions
            const defaultHrs = aircraftHoursDefaults ? (parseFloat(aircraftHoursDefaults[column]) || null) : null;

            // Auto-accept if within 2x/0.5x of default, flag outliers
            let accepted = null;
            let status = null;
            if (defaultHrs && defaultHrs > 0) {
              if (actualHrs <= defaultHrs * 2 && actualHrs >= defaultHrs * 0.5) {
                accepted = true;
                status = 'accepted';
              } else {
                accepted = null;
                status = 'outlier';
              }
            }

            await supabase.from('hours_contributions').insert({
              make: contributionMake,
              model: contributionModel,
              service_type: serviceType,
              contributed_hrs: actualHrs,
              aircraft_hours_default: defaultHrs,
              detailer_hash: detailerHash,
              quote_id: quote_id,
              accepted,
              status,
            });
          } else if (column === undefined) {
            // Unknown service type -> insert into suggested_services
            await supabase.from('suggested_services').insert({
              service_name: sh.service_name || serviceType,
              service_key: serviceType,
              detailer_hash: detailerHash,
              make: contributionMake,
              model: contributionModel,
              contributed_hrs: actualHrs,
            });
          }
        }
      } catch (e) {
        console.error('Failed to track hours contributions:', e);
      }
    }

    // Update quote status to completed
    const completedAt = new Date().toISOString();
    await supabase
      .from('quotes')
      .update({
        status: 'completed',
        completed_at: completedAt,
        actual_hours: parseFloat(actual_hours) || quote.total_hours,
        product_cost: parseFloat(product_cost) || 0,
        completion_notes: notes,
      })
      .eq('id', quote_id);

    // Create/update jobs table record
    try {
      const { data: existingJob } = await supabase
        .from('jobs')
        .select('id')
        .eq('quote_id', quote_id)
        .maybeSingle();

      if (existingJob) {
        await supabase.from('jobs').update({
          status: 'complete',
          completed_at: completedAt,
          completion_notes: notes,
          updated_at: completedAt,
        }).eq('id', existingJob.id);
      } else {
        await supabase.from('jobs').insert({
          quote_id,
          detailer_id: user.id,
          customer_name: quote.client_name || quote.customer_name,
          customer_email: quote.client_email || quote.customer_email,
          tail_number: quote.tail_number,
          aircraft_make: quote.aircraft_type,
          aircraft_model: quote.aircraft_model,
          services: typeof quote.services === 'object' ? JSON.stringify(quote.services) : quote.services,
          status: 'complete',
          total_price: quote.total_price,
          completed_at: completedAt,
          completion_notes: notes,
        });
      }
    } catch (jobErr) {
      console.error('Failed to create/update jobs record:', jobErr);
    }

    // Log activity
    const clientEmail = quote.customer_email || quote.client_email;
    if (clientEmail) {
      const aircraft = quote.aircraft_model || quote.aircraft_type || 'Aircraft';
      logActivity({
        detailer_id: user.id,
        customer_email: clientEmail,
        activity_type: ACTIVITY.JOB_COMPLETED,
        summary: `Job completed for ${aircraft}`,
        details: { aircraft, amount: quote.total_price, actual_hours: parseFloat(actual_hours) || quote.total_hours },
        quote_id: quote_id,
      });
    }

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
            .select('quantity')
            .eq('id', usage.product_id)
            .eq('detailer_id', user.id)
            .single();

          if (product) {
            const newQuantity = Math.max(0, (product.quantity || 0) - parseFloat(usage.amount));
            await supabase
              .from('products')
              .update({
                quantity: newQuantity,
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

    // Bonus points for contributing hours data
    if (service_hours && service_hours.length > 0) {
      totalPoints += 15;
      pointReasons.push({ reason: 'hours_contribution', points: 15 });
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

    // Send immediate review request if configured
    try {
      const { data: detailerSettings } = await supabase
        .from('detailers')
        .select('review_request_enabled, review_request_delay_days, name, email, company')
        .eq('id', user.id)
        .single();

      const clientEmail = quote.customer_email || quote.client_email;
      if (detailerSettings?.review_request_enabled !== false &&
          detailerSettings?.review_request_delay_days === 0 &&
          clientEmail) {
        const crypto = await import('crypto');
        const feedbackToken = crypto.randomBytes(16).toString('hex');
        await supabase.from('quotes').update({
          feedback_token: feedbackToken,
          feedback_requested_at: new Date().toISOString(),
        }).eq('id', quote_id);

        const { sendFeedbackRequestEmail } = await import('@/lib/email');
        await sendFeedbackRequestEmail({
          quote: { ...quote, feedback_token: feedbackToken },
          detailer: detailerSettings,
        });
      }
    } catch (reviewErr) {
      console.error('Failed to send immediate review request:', reviewErr);
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
