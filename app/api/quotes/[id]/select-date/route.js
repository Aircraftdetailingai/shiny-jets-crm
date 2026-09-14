import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST — customer selects an offered date or requests an alternate.
 * Body: { shareLink, selectedDate?, alternateDate?, alternateNotes? }
 */
export async function POST(request, { params }) {
  const supabase = getSupabase();
  const { id } = params;

  try {
    const body = await request.json();
    const { shareLink, selectedDate, alternateDate, alternateNotes } = body || {};

    if (!id || !shareLink) {
      return Response.json({ error: 'Quote ID and share link are required' }, { status: 400 });
    }

    const wantsOffered = !!selectedDate;
    const wantsAlternate = !!alternateDate;

    if (!wantsOffered && !wantsAlternate) {
      return Response.json({ error: 'Select an offered date or request an alternate' }, { status: 400 });
    }
    if (wantsOffered && wantsAlternate) {
      return Response.json({ error: 'Choose either an offered date or an alternate, not both' }, { status: 400 });
    }
    if (selectedDate && !DATE_RE.test(selectedDate)) {
      return Response.json({ error: 'Invalid selected date' }, { status: 400 });
    }
    if (alternateDate && !DATE_RE.test(alternateDate)) {
      return Response.json({ error: 'Invalid alternate date' }, { status: 400 });
    }

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, detailer_id, status, share_link, available_dates, customer_selected_date, scheduled_date, client_name, aircraft_model, aircraft_type, metadata')
      .eq('id', id)
      .eq('share_link', shareLink)
      .single();

    if (quoteError || !quote) {
      return Response.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.scheduled_date || ['scheduled', 'in_progress', 'completed', 'cancelled'].includes(quote.status)) {
      return Response.json({ error: 'This quote can no longer change dates' }, { status: 400 });
    }

    const offered = Array.isArray(quote.available_dates)
      ? quote.available_dates.map(d => (typeof d === 'string' ? d : d?.date)).filter(Boolean)
      : [];

    const metaOffered = Array.isArray(quote.metadata?.available_dates)
      ? quote.metadata.available_dates.map(d => (typeof d === 'string' ? d : d?.date)).filter(Boolean)
      : [];
    const offeredDates = offered.length > 0 ? offered : metaOffered;

    if (wantsOffered) {
      if (offeredDates.length === 0) {
        return Response.json({ error: 'This quote has no offered dates' }, { status: 400 });
      }
      if (!offeredDates.includes(selectedDate)) {
        return Response.json({ error: 'Selected date is not one of the offered options' }, { status: 400 });
      }
    }

    const updateFields = {
      customer_selected_date: wantsOffered ? selectedDate : null,
      alternate_date_requested: wantsAlternate ? alternateDate : null,
      alternate_date_notes: wantsAlternate ? (alternateNotes || null) : null,
      metadata: {
        ...(quote.metadata || {}),
        available_dates: offeredDates,
        customer_selected_date: wantsOffered ? selectedDate : null,
        alternate_date_requested: wantsAlternate ? alternateDate : null,
        alternate_date_notes: wantsAlternate ? (alternateNotes || null) : null,
        date_selection_at: new Date().toISOString(),
      },
    };

    let updateRes;
    for (let attempt = 0; attempt < 5; attempt++) {
      updateRes = await supabase.from('quotes').update(updateFields).eq('id', id);
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
      console.error('[select-date] update error:', updateRes.error.message);
      return Response.json({ error: 'Failed to save date selection' }, { status: 500 });
    }

    try {
      const label = wantsOffered
        ? new Date(selectedDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        : `alternate ${new Date(alternateDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
      await supabase.from('notifications').insert({
        detailer_id: quote.detailer_id,
        type: 'date_selected',
        title: wantsOffered ? 'Customer Selected a Date' : 'Customer Requested Alternate Date',
        message: `${quote.client_name || 'Customer'} chose ${label} for ${quote.aircraft_model || quote.aircraft_type || 'detail'}`,
        metadata: {
          quote_id: id,
          customer_selected_date: wantsOffered ? selectedDate : null,
          alternate_date_requested: wantsAlternate ? alternateDate : null,
        },
        link: `/quotes?id=${id}`,
      });
    } catch (e) {
      console.error('[select-date] notification failed:', e);
    }

    return Response.json({
      success: true,
      customer_selected_date: wantsOffered ? selectedDate : null,
      alternate_date_requested: wantsAlternate ? alternateDate : null,
      alternate_date_notes: wantsAlternate ? (alternateNotes || null) : null,
    });
  } catch (err) {
    console.error('[select-date] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
