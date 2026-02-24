import { createClient } from '@supabase/supabase-js';
import { sendRecurringReminderEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function addInterval(date, interval) {
  const d = new Date(date);
  switch (interval) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case '4_weeks':
      d.setDate(d.getDate() + 28);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case '6_weeks':
      d.setDate(d.getDate() + 42);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

function formatInterval(interval) {
  const labels = {
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    '4_weeks': 'Every 4 weeks',
    monthly: 'Monthly',
    '6_weeks': 'Every 6 weeks',
    quarterly: 'Quarterly',
  };
  return labels[interval] || interval;
}

export async function POST(request) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  const today = new Date().toISOString().split('T')[0];
  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + 3);
  const reminderDateStr = reminderDate.toISOString().split('T')[0];

  let generated = 0;
  let reminders = 0;
  const errors = [];

  try {
    // 1. AUTO-GENERATE QUOTES: Find recurring quotes where next_service_date <= today
    const { data: dueQuotes, error: dueError } = await supabase
      .from('quotes')
      .select('*, detailers(name, email, company, phone)')
      .eq('is_recurring', true)
      .eq('recurring_enabled', true)
      .lte('next_service_date', today);

    if (dueError) {
      console.error('Failed to fetch due recurring quotes:', dueError);
      errors.push(`Fetch due: ${dueError.message}`);
    }

    for (const quote of dueQuotes || []) {
      try {
        // Generate a new quote based on the recurring template
        const { nanoid } = await import('nanoid');
        const shareLink = nanoid(8);
        const validUntil = new Date();
        validUntil.setDate(validUntil.getDate() + 30);

        const { data: newQuote, error: insertError } = await supabase
          .from('quotes')
          .insert({
            detailer_id: quote.detailer_id,
            aircraft_type: quote.aircraft_type,
            aircraft_model: quote.aircraft_model,
            aircraft_id: quote.aircraft_id || null,
            total_price: quote.total_price,
            total_hours: quote.total_hours || null,
            notes: quote.notes || null,
            share_link: shareLink,
            valid_until: validUntil.toISOString(),
            status: 'sent',
            services: quote.services || null,
            customer_name: quote.customer_name || quote.client_name || null,
            customer_email: quote.customer_email || quote.client_email || null,
            customer_phone: quote.customer_phone || quote.client_phone || null,
            customer_company: quote.customer_company || null,
            customer_id: quote.customer_id || null,
            line_items: quote.line_items || null,
            metadata: {
              ...(quote.metadata || {}),
              generated_from_recurring: quote.id,
              recurring_interval: quote.recurring_interval,
            },
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Failed to generate quote from recurring ${quote.id}:`, insertError);
          errors.push(`Generate ${quote.id}: ${insertError.message}`);
          continue;
        }

        // Update the recurring quote's next_service_date
        const nextDate = addInterval(quote.next_service_date, quote.recurring_interval);
        await supabase
          .from('quotes')
          .update({ next_service_date: nextDate })
          .eq('id', quote.id);

        // Send email to customer about new service
        const clientEmail = quote.customer_email || quote.client_email;
        if (clientEmail) {
          const detailer = quote.detailers || {};
          try {
            await sendRecurringReminderEmail({
              quote: { ...newQuote, client_email: clientEmail, client_name: quote.customer_name || quote.client_name },
              detailer,
              isNewQuote: true,
            });
          } catch (emailErr) {
            console.error(`Email failed for recurring ${quote.id}:`, emailErr);
          }
        }

        generated++;
      } catch (genErr) {
        console.error(`Error generating from recurring ${quote.id}:`, genErr);
        errors.push(`Generate ${quote.id}: ${genErr.message}`);
      }
    }

    // 2. SEND REMINDERS: Find recurring quotes where next_service_date = 3 days from now
    const { data: upcomingQuotes, error: upcomingError } = await supabase
      .from('quotes')
      .select('*, detailers(name, email, company, phone)')
      .eq('is_recurring', true)
      .eq('recurring_enabled', true)
      .eq('next_service_date', reminderDateStr);

    if (upcomingError) {
      console.error('Failed to fetch upcoming recurring quotes:', upcomingError);
      errors.push(`Fetch upcoming: ${upcomingError.message}`);
    }

    for (const quote of upcomingQuotes || []) {
      try {
        const clientEmail = quote.customer_email || quote.client_email;
        if (!clientEmail) continue;

        const detailer = quote.detailers || {};
        await sendRecurringReminderEmail({
          quote: { ...quote, client_email: clientEmail, client_name: quote.customer_name || quote.client_name },
          detailer,
          isNewQuote: false,
        });
        reminders++;
      } catch (reminderErr) {
        console.error(`Reminder failed for ${quote.id}:`, reminderErr);
        errors.push(`Reminder ${quote.id}: ${reminderErr.message}`);
      }
    }

  } catch (err) {
    console.error('Recurring cron error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    generated,
    reminders,
    errors: errors.length > 0 ? errors : undefined,
  });
}
