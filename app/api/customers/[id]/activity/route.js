import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// Helper: query with column-stripping retry
async function queryWithRetry(supabase, table, selectCols, filters, options = {}) {
  let cols = selectCols;
  for (let attempt = 0; attempt < 5; attempt++) {
    let q = supabase.from(table).select(cols);
    for (const [key, val] of Object.entries(filters)) {
      if (key === '_ilike') {
        for (const [col, v] of Object.entries(val)) q = q.ilike(col, v);
      } else {
        q = q.eq(key, val);
      }
    }
    if (options.order) q = q.order(options.order, { ascending: options.ascending ?? false });
    if (options.limit) q = q.limit(options.limit);
    const { data, error } = await q;
    if (!error) return data || [];
    const colMatch = error.message?.match(/column [\w.]+"?(\w+)"? does not exist/)
      || error.message?.match(/Could not find the '([^']+)' column/)
      || error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      const badCol = colMatch[1];
      cols = cols.split(',').map(c => c.trim()).filter(c => c !== badCol).join(', ');
      console.log(`[activity] Stripped missing column '${badCol}' from ${table}, retrying...`);
      continue;
    }
    console.log(`[activity] Query error on ${table}:`, error.message);
    return [];
  }
  return [];
}

// GET - Activity timeline for a customer
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const supabase = getSupabase();

  // Get customer email
  const { data: customer } = await supabase
    .from('customers')
    .select('email, created_at')
    .eq('id', id)
    .eq('detailer_id', user.id)
    .single();

  if (!customer) {
    console.log('[activity] Customer not found:', id, 'detailer:', user.id);
    return Response.json({ error: 'Customer not found' }, { status: 404 });
  }

  const email = customer.email.toLowerCase().trim();
  console.log('[activity] customer_id:', id, '| email:', email, '| detailer_id:', user.id);

  // Fetch all data sources in parallel
  const [activityData, quotes, feedbackData, notesData] = await Promise.all([
    // Explicit activity log entries
    queryWithRetry(supabase, 'customer_activity_log', '*',
      { detailer_id: user.id, customer_email: email },
      { order: 'created_at', limit: 200 }
    ).catch(() => []),

    // All quotes for this customer (case-insensitive email match)
    queryWithRetry(supabase, 'quotes',
      'id, aircraft_model, aircraft_type, total_price, status, created_at, sent_at, viewed_at, accepted_at, paid_at, completed_at, scheduled_date, valid_until, client_email, followup_5day_sent',
      { detailer_id: user.id, _ilike: { client_email: email } },
      { order: 'created_at', limit: 100 }
    ),

    // Feedback from this customer
    queryWithRetry(supabase, 'feedback', 'id, quote_id, rating, comment, created_at',
      { detailer_id: user.id, customer_email: email },
      { order: 'created_at', limit: 50 }
    ).catch(() => []),

    // Notes
    queryWithRetry(supabase, 'customer_notes', 'id, content, created_at',
      { customer_id: id, detailer_id: user.id },
      { order: 'created_at', limit: 50 }
    ).catch(() => []),
  ]);

  console.log('[activity] quotes found:', quotes.length, '| activity_log:', activityData.length, '| feedback:', feedbackData.length, '| notes:', notesData.length);

  const timeline = [];

  // Explicit activity log entries
  for (const a of activityData) {
    timeline.push({
      id: `activity-${a.id}`,
      type: a.activity_type,
      summary: a.summary,
      details: a.details || {},
      date: a.created_at,
      source: 'log',
    });
  }

  // Track which events are already logged
  const loggedQuoteEvents = new Set(
    activityData
      .filter(a => a.quote_id)
      .map(a => `${a.quote_id}-${a.activity_type}`)
  );

  // Derive events from quotes
  for (const q of quotes) {
    const aircraft = q.aircraft_model || q.aircraft_type || 'Aircraft';
    const amount = q.total_price ? `$${Number(q.total_price).toLocaleString()}` : '';
    const shortId = q.id.slice(0, 8).toUpperCase();

    if (q.created_at && !loggedQuoteEvents.has(`${q.id}-quote_created`)) {
      timeline.push({
        id: `q-created-${q.id}`,
        type: 'quote_created',
        summary: `Quote #${shortId} created for ${aircraft}`,
        details: { aircraft, amount: q.total_price, quoteId: q.id },
        date: q.created_at,
        source: 'derived',
        quote_id: q.id,
      });
    }

    if (q.sent_at && !loggedQuoteEvents.has(`${q.id}-quote_sent`)) {
      timeline.push({
        id: `q-sent-${q.id}`,
        type: 'quote_sent',
        summary: `Quote #${shortId} sent to ${q.client_email || email}`,
        details: { aircraft, amount: q.total_price, quoteId: q.id },
        date: q.sent_at,
        source: 'derived',
        quote_id: q.id,
      });
    }

    if (q.viewed_at && !loggedQuoteEvents.has(`${q.id}-quote_viewed`)) {
      timeline.push({
        id: `q-viewed-${q.id}`,
        type: 'quote_viewed',
        summary: `Quote #${shortId} viewed by customer`,
        details: { aircraft, quoteId: q.id },
        date: q.viewed_at,
        source: 'derived',
        quote_id: q.id,
      });
    }

    if (q.accepted_at && !loggedQuoteEvents.has(`${q.id}-quote_accepted`)) {
      timeline.push({
        id: `q-accepted-${q.id}`,
        type: 'quote_accepted',
        summary: `Quote #${shortId} accepted`,
        details: { aircraft, amount: q.total_price, quoteId: q.id },
        date: q.accepted_at,
        source: 'derived',
        quote_id: q.id,
      });
    }

    if (q.paid_at && !loggedQuoteEvents.has(`${q.id}-payment_received`)) {
      timeline.push({
        id: `q-paid-${q.id}`,
        type: 'payment_received',
        summary: `Payment of ${amount} received for Quote #${shortId}`,
        details: { aircraft, amount: q.total_price, quoteId: q.id },
        date: q.paid_at,
        source: 'derived',
        quote_id: q.id,
      });
    }

    if (q.completed_at && !loggedQuoteEvents.has(`${q.id}-job_completed`)) {
      timeline.push({
        id: `q-completed-${q.id}`,
        type: 'job_completed',
        summary: `Job completed \u2014 ${aircraft}`,
        details: { aircraft, amount: q.total_price, quoteId: q.id },
        date: q.completed_at,
        source: 'derived',
        quote_id: q.id,
      });
    }

    if (q.scheduled_date && (q.status === 'paid' || q.status === 'scheduled' || q.status === 'in_progress')) {
      const schedDate = new Date(q.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      timeline.push({
        id: `q-scheduled-${q.id}`,
        type: 'job_scheduled',
        summary: `Job scheduled for ${schedDate}`,
        details: { aircraft, amount: q.total_price, quoteId: q.id, scheduledDate: q.scheduled_date },
        date: q.scheduled_date,
        source: 'derived',
        quote_id: q.id,
      });
    }

    if (q.status === 'expired' && q.valid_until) {
      timeline.push({
        id: `q-expired-${q.id}`,
        type: 'quote_expired',
        summary: `Quote #${shortId} expired \u2014 ${aircraft} ${amount}`,
        details: { aircraft, amount: q.total_price, quoteId: q.id },
        date: q.valid_until,
        source: 'derived',
        quote_id: q.id,
      });
    }

    if (q.followup_5day_sent) {
      timeline.push({
        id: `q-followup-${q.id}`,
        type: 'followup_sent',
        summary: 'Follow-up email sent',
        details: { aircraft, quoteId: q.id },
        date: q.followup_5day_sent,
        source: 'derived',
        quote_id: q.id,
      });
    }
  }

  // Feedback events
  for (const f of feedbackData) {
    const stars = '\u2605'.repeat(f.rating || 0);
    timeline.push({
      id: `feedback-${f.id}`,
      type: 'feedback_received',
      summary: `Feedback received: ${stars}${f.comment ? ' - "' + f.comment.substring(0, 80) + '"' : ''}`,
      details: { rating: f.rating, comment: f.comment, quoteId: f.quote_id },
      date: f.created_at,
      source: 'derived',
    });
  }

  // Note events
  const loggedNoteIds = new Set(
    activityData.filter(a => a.activity_type === 'note_added').map(a => a.details?.note_id)
  );
  for (const n of notesData) {
    if (!loggedNoteIds.has(n.id)) {
      timeline.push({
        id: `note-${n.id}`,
        type: 'note_added',
        summary: `Note: "${n.content.substring(0, 100)}${n.content.length > 100 ? '...' : ''}"`,
        details: {},
        date: n.created_at,
        source: 'derived',
      });
    }
  }

  // Customer created event
  if (customer.created_at) {
    timeline.push({
      id: `customer-created`,
      type: 'customer_created',
      summary: 'Customer added',
      details: {},
      date: customer.created_at,
      source: 'derived',
    });
  }

  // Deduplicate by type+date proximity (within 1 minute)
  const seen = new Set();
  const deduped = timeline.filter(item => {
    const key = `${item.type}-${item.quote_id || item.id}-${Math.floor(new Date(item.date).getTime() / 60000)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => new Date(b.date) - new Date(a.date));

  return Response.json({ activity: deduped.slice(0, 200) });
}
