import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Check for pending documentation reminders
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

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Get today's jobs that are scheduled or in progress
    const { data: todayJobs } = await supabase
      .from('quotes')
      .select('id, aircraft_type, aircraft_model, scheduled_date, scheduled_time, total_hours, status')
      .eq('detailer_id', user.id)
      .eq('scheduled_date', today)
      .in('status', ['accepted', 'scheduled', 'in_progress']);

    const reminders = [];

    for (const job of todayJobs || []) {
      // Check if job has media
      const { data: media } = await supabase
        .from('job_media')
        .select('media_type')
        .eq('quote_id', job.id);

      const hasBeforeMedia = media?.some(m => m.media_type.startsWith('before_'));
      const hasAfterMedia = media?.some(m => m.media_type.startsWith('after_'));

      // Calculate job times
      const scheduledTime = job.scheduled_time || '09:00';
      const [hours, minutes] = scheduledTime.split(':').map(Number);
      const jobStart = new Date(job.scheduled_date);
      jobStart.setHours(hours, minutes, 0, 0);

      const jobDurationMs = (job.total_hours || 2) * 60 * 60 * 1000;
      const jobEnd = new Date(jobStart.getTime() + jobDurationMs);

      const tenMinAfterStart = new Date(jobStart.getTime() + 10 * 60 * 1000);
      const fifteenMinBeforeEnd = new Date(jobEnd.getTime() - 15 * 60 * 1000);

      // Before media reminder: if job started 10+ min ago and no before media
      if (now >= tenMinAfterStart && now < jobEnd && !hasBeforeMedia) {
        reminders.push({
          type: 'before_media_missing',
          quote_id: job.id,
          aircraft: `${job.aircraft_type} ${job.aircraft_model}`,
          title: 'Take Before Photos/Video',
          message: `Job started but no before documentation. Take photos now to protect yourself.`,
          action_url: `/jobs/${job.id}/photos`,
          priority: 'high',
        });
      }

      // After media reminder: 15 min before job end and no after media
      if (now >= fifteenMinBeforeEnd && now < jobEnd && !hasAfterMedia) {
        reminders.push({
          type: 'after_media_reminder',
          quote_id: job.id,
          aircraft: `${job.aircraft_type} ${job.aircraft_model}`,
          title: 'Take After Photos',
          message: `Job ending soon. Document your completed work before you leave.`,
          action_url: `/jobs/${job.id}/photos`,
          priority: 'medium',
        });
      }

      // Job complete but no after media
      if (job.status === 'completed' && !hasAfterMedia) {
        reminders.push({
          type: 'after_media_missing',
          quote_id: job.id,
          aircraft: `${job.aircraft_type} ${job.aircraft_model}`,
          title: 'Missing After Photos',
          message: `Job marked complete but no after photos. Add them for your records.`,
          action_url: `/jobs/${job.id}/photos`,
          priority: 'low',
        });
      }
    }

    return Response.json({
      reminders,
      hasReminders: reminders.length > 0,
    });

  } catch (err) {
    console.error('Job reminders error:', err);
    return Response.json({ error: 'Failed to check reminders' }, { status: 500 });
  }
}

// POST - Dismiss a reminder
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
    const { quote_id, reminder_type, action } = body;

    if (!quote_id || !reminder_type) {
      return Response.json({ error: 'quote_id and reminder_type required' }, { status: 400 });
    }

    // Store dismissed reminder
    await supabase
      .from('dismissed_reminders')
      .upsert({
        detailer_id: user.id,
        quote_id,
        reminder_type,
        action: action || 'dismissed',
        dismissed_at: new Date().toISOString(),
      }, {
        onConflict: 'detailer_id,quote_id,reminder_type',
      });

    return Response.json({ success: true });

  } catch (err) {
    console.error('Dismiss reminder error:', err);
    return Response.json({ error: 'Failed to dismiss reminder' }, { status: 500 });
  }
}
