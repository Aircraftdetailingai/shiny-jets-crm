import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request, { params }) {
  const supabase = getSupabase();
  const { id } = params;
  const url = new URL(request.url);
  const shareLink = url.searchParams.get('share_link');

  if (!id || !shareLink) {
    return Response.json({ error: 'Quote ID and share_link required' }, { status: 400 });
  }

  // Fetch quote and verify share_link
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id, detailer_id, status, share_link, scheduled_date, available_dates, metadata')
    .eq('id', id)
    .eq('share_link', shareLink)
    .single();

  if (quoteError || !quote) {
    return Response.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Only show scheduling for paid/accepted quotes that aren't already scheduled
  const schedulableStatuses = ['paid', 'approved', 'accepted', 'deposit_paid'];
  if (!schedulableStatuses.includes(quote.status) || quote.scheduled_date) {
    return Response.json({ available: false, reason: 'not_schedulable' });
  }

  // Fetch detailer's availability and Calendly settings
  const { data: detailer } = await supabase
    .from('detailers')
    .select('availability, calendly_url, use_calendly_scheduling')
    .eq('id', quote.detailer_id)
    .single();

  // Prefer owner-offered dates attached to the quote (never invent extras)
  const fromCol = Array.isArray(quote.available_dates) ? quote.available_dates : [];
  const fromMeta = Array.isArray(quote.metadata?.available_dates) ? quote.metadata.available_dates : [];
  const offeredRaw = fromCol.length ? fromCol : fromMeta;
  const offered = offeredRaw.map(d => (typeof d === 'string' ? d : d?.date)).filter(Boolean);
  if (offered.length > 0) {
    return Response.json({
      available: true,
      source: 'quote_offered',
      dates: offered.map(date => ({ date, offered: true })),
      calendly_url: detailer?.calendly_url || null,
      use_calendly_scheduling: detailer?.use_calendly_scheduling || false,
    });
  }

  const availability = detailer?.availability;
  if (!availability || !availability.weeklySchedule) {
    return Response.json({ available: false, reason: 'not_configured' });
  }

  const { weeklySchedule, blockedDates, leadTimeDays, maxAdvanceDays } = availability;
  const blockedSet = new Set(blockedDates || []);
  const lead = leadTimeDays ?? 2;
  const maxDays = 365;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + lead);
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + maxDays);

  // Fetch already-scheduled quotes for this detailer
  const { data: scheduledQuotes } = await supabase
    .from('quotes')
    .select('scheduled_date')
    .eq('detailer_id', quote.detailer_id)
    .gte('scheduled_date', startDate.toISOString())
    .lte('scheduled_date', endDate.toISOString())
    .in('status', ['scheduled', 'in_progress']);

  const bookingCounts = {};
  (scheduledQuotes || []).forEach(q => {
    const dateStr = new Date(q.scheduled_date).toISOString().split('T')[0];
    bookingCounts[dateStr] = (bookingCounts[dateStr] || 0) + 1;
  });

  // Build available dates
  const dates = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dateStr = cursor.toISOString().split('T')[0];
    const dow = cursor.getDay();
    const daySchedule = weeklySchedule[String(dow)];

    if (daySchedule && !blockedSet.has(dateStr)) {
      dates.push({
        date: dateStr,
        dayOfWeek: dow,
        start: daySchedule.start,
        end: daySchedule.end,
        bookedCount: bookingCounts[dateStr] || 0,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Response.json({
    available: true,
    dates,
    calendly_url: detailer.calendly_url || null,
    use_calendly_scheduling: detailer.use_calendly_scheduling || false,
  });
}
