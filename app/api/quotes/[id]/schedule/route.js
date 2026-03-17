import { createClient } from '@supabase/supabase-js';
import { sendJobScheduledEmail, sendBookingReceivedEmail, sendStaffingAlertEmail } from '@/lib/email';
import { sendPushNotification } from '@/lib/push';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const supabase = getSupabase();

  try {
    const { shareLink, scheduledDate, timePreference, schedulingNotes } = await request.json();
    const { id } = params;

    if (!id || !shareLink || !scheduledDate) {
      return Response.json({ error: 'Quote ID, share link, and date are required' }, { status: 400 });
    }

    // Fetch quote with share_link verification
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, detailer_id, total_price, aircraft_model, aircraft_type, status, client_name, client_email, client_phone, share_link, airport, scheduled_date')
      .eq('id', id)
      .eq('share_link', shareLink)
      .single();

    if (quoteError || !quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.scheduled_date || quote.status === 'scheduled' || quote.status === 'in_progress' || quote.status === 'completed') {
      return Response.json({ error: 'This quote is already scheduled' }, { status: 400 });
    }

    const schedulableStatuses = ['paid', 'approved', 'accepted'];
    if (!schedulableStatuses.includes(quote.status)) {
      return Response.json({ error: 'Quote must be paid or accepted before scheduling' }, { status: 400 });
    }

    // Validate date is available
    const { data: detailer } = await supabase
      .from('detailers')
      .select('id, name, email, phone, company, availability, fcm_token, preferred_currency, logo_url, font_heading, font_body, font_embed_url')
      .eq('id', quote.detailer_id)
      .single();

    const availability = detailer?.availability;
    if (!availability || !availability.weeklySchedule) {
      return Response.json({ error: 'Scheduling is not available' }, { status: 400 });
    }

    const selectedDate = new Date(scheduledDate + 'T12:00:00');
    const dow = selectedDate.getDay();
    const daySchedule = availability.weeklySchedule[String(dow)];

    if (!daySchedule) {
      return Response.json({ error: 'Selected day is not a working day' }, { status: 400 });
    }

    const blockedSet = new Set(availability.blockedDates || []);
    if (blockedSet.has(scheduledDate)) {
      return Response.json({ error: 'Selected date is blocked' }, { status: 400 });
    }

    // Build scheduled_date timestamp using the day's start time
    const scheduledDateTime = new Date(`${scheduledDate}T${daySchedule.start}:00`).toISOString();

    // Update quote with scheduling info (column-stripping retry)
    let updateFields = {
      scheduled_date: scheduledDateTime,
      time_preference: timePreference || null,
      scheduling_notes: schedulingNotes || null,
      status: 'scheduled',
    };

    let updateRes;
    for (let attempt = 0; attempt < 3; attempt++) {
      updateRes = await supabase
        .from('quotes')
        .update(updateFields)
        .eq('id', id);
      if (!updateRes.error) break;
      const colMatch = updateRes.error.message?.match(/column ['"](\w+)['"] .* does not exist/i)
        || updateRes.error.message?.match(/Could not find the '(\w+)' column/i);
      if (colMatch) {
        delete updateFields[colMatch[1]];
        continue;
      }
      break;
    }

    if (updateRes?.error) {
      console.error('[schedule] update error:', updateRes.error.message);
      return Response.json({ error: 'Failed to schedule' }, { status: 500 });
    }

    // Send confirmation email to customer
    try {
      await sendJobScheduledEmail({ quote, detailer, scheduledDate: scheduledDateTime });
    } catch (e) {
      console.error('[schedule] customer email failed:', e);
    }

    // Send notification email to detailer
    try {
      await sendBookingReceivedEmail({
        quote,
        detailer,
        scheduledDate: scheduledDateTime,
        timePreference: timePreference || 'No preference',
        schedulingNotes: schedulingNotes || '',
      });
    } catch (e) {
      console.error('[schedule] detailer email failed:', e);
    }

    // In-app notification
    try {
      const dateStr = new Date(scheduledDateTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      await supabase.from('notifications').insert({
        detailer_id: quote.detailer_id,
        type: 'job_scheduled',
        title: 'Job Scheduled by Customer',
        message: `${quote.client_name || 'Customer'} scheduled ${quote.aircraft_model || quote.aircraft_type || 'detail'} for ${dateStr}`,
        metadata: { quote_id: id, scheduled_date: scheduledDate },
      });
    } catch {}

    // Push notification
    try {
      if (detailer?.fcm_token) {
        const dateStr = new Date(scheduledDateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        await sendPushNotification({
          fcmToken: detailer.fcm_token,
          title: 'Job Scheduled!',
          body: `${quote.client_name || 'Customer'} scheduled ${quote.aircraft_model || quote.aircraft_type || 'detail'} for ${dateStr}`,
          data: { type: 'job_scheduled', quoteId: quote.id },
        });
      }
    } catch {}

    // Staffing alert for bookings 14+ days out
    try {
      const daysOut = Math.floor((new Date(scheduledDate) - new Date()) / 86400000);
      if (daysOut >= 14) {
        await supabase.from('staffing_alerts').insert({
          detailer_id: quote.detailer_id,
          quote_id: id,
          scheduled_date: scheduledDate,
          alert_type: 'needs_coverage',
        });

        // Staffing alert notification
        const alertDateStr = new Date(scheduledDateTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        await supabase.from('notifications').insert({
          detailer_id: quote.detailer_id,
          type: 'staffing_alert',
          title: 'Staff Coverage Needed',
          message: `${quote.client_name || 'Customer'} booked ${quote.aircraft_model || quote.aircraft_type || 'detail'} for ${alertDateStr} — assign staff coverage`,
          metadata: { quote_id: id, scheduled_date: scheduledDate },
          link: '/jobs',
        });

        // Staffing alert email
        sendStaffingAlertEmail({
          quote,
          detailer,
          scheduledDate: scheduledDateTime,
          daysOut,
        }).catch(e => console.error('[schedule] staffing alert email failed:', e));
      }
    } catch (e) {
      console.error('[schedule] staffing alert creation failed:', e);
    }

    return Response.json({ success: true, scheduled_date: scheduledDateTime });
  } catch (err) {
    console.error('[schedule] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
