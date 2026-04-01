import { getSupabase, resolvePortalCustomer } from '@/lib/portal-auth';
import { notifyNewQuoteRequest } from '@/lib/push';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { token, fleet_aircraft_id, services, preferred_date, notes } = await request.json();

  const resolved = await resolvePortalCustomer(token);
  if (!resolved) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!fleet_aircraft_id) {
    return Response.json({ error: 'Fleet aircraft ID is required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch fleet aircraft details
  const { data: aircraft, error: aircraftErr } = await supabase
    .from('customer_fleet')
    .select('*')
    .eq('id', fleet_aircraft_id)
    .eq('customer_id', resolved.customer.id)
    .single();

  if (aircraftErr || !aircraft) {
    return Response.json({ error: 'Aircraft not found' }, { status: 404 });
  }

  const location = aircraft.home_airport;
  let routedDetailer = null;
  let routedTo = 'admin';

  // Auto-routing: find detailers at the aircraft's home airport
  if (location) {
    const { data: detailers } = await supabase
      .from('detailers')
      .select('id, name, email, phone, company, fcm_token, notification_settings')
      .eq('home_airport', location)
      .limit(5);

    if (detailers && detailers.length > 0) {
      routedDetailer = detailers[0];
      routedTo = routedDetailer.email;
    }
  }

  // Create fleet service request
  const { data: fsr, error: fsrErr } = await supabase
    .from('fleet_service_requests')
    .insert({
      customer_id: resolved.customer.id,
      fleet_aircraft_id,
      detailer_id: routedDetailer?.id || null,
      services: services || [],
      preferred_date: preferred_date || null,
      location: location || null,
      notes: notes || null,
      status: 'pending',
      routed_to: routedTo,
    })
    .select()
    .single();

  if (fsrErr) {
    console.error('Failed to create fleet service request:', fsrErr);
    return Response.json({ error: 'Failed to create service request' }, { status: 500 });
  }

  const customerName = resolved.customer.name || resolved.customer.email || 'A customer';
  const aircraftLabel = `${aircraft.make || ''} ${aircraft.model || ''} (${aircraft.tail_number})`.trim();
  const servicesList = Array.isArray(services) ? services.join(', ') : 'Services requested';

  if (routedDetailer) {
    // Create quote_requests entry for the matched detailer
    try {
      await supabase
        .from('quote_requests')
        .insert({
          detailer_id: routedDetailer.id,
          client_name: resolved.customer.name || '',
          client_email: resolved.customer.email || '',
          client_phone: '',
          aircraft_type: aircraft.make || '',
          aircraft_model: aircraft.model || '',
          services: services || [],
          notes: `Fleet service request for ${aircraft.tail_number}${aircraft.nickname ? ` (${aircraft.nickname})` : ''} at ${location || 'unspecified location'}. ${notes || ''}`.trim(),
          status: 'pending',
        });
    } catch (e) {
      console.log('Could not create quote_request:', e);
    }

    // Send push notification
    if (routedDetailer.fcm_token) {
      notifyNewQuoteRequest({
        fcmToken: routedDetailer.fcm_token,
        quote: { client_name: customerName, aircraft_model: aircraftLabel },
      }).catch(console.error);
    }

    // Send email notification
    if (routedDetailer.email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Shiny Jets CRM <noreply@vectorav.ai>',
            to: routedDetailer.email,
            subject: 'New Fleet Service Request',
            text: `New fleet service request!\n\nCustomer: ${customerName}\nAircraft: ${aircraftLabel}\nLocation: ${location || 'Not specified'}\nServices: ${servicesList}\n${preferred_date ? `Preferred Date: ${preferred_date}\n` : ''}${notes ? `Notes: ${notes}\n` : ''}\nLog in to Shiny Jets CRM to send them a quote.`,
          }),
        });
      } catch (e) {
        console.error('Failed to send notification email:', e);
      }
    }

    // Send SMS
    if (routedDetailer.phone && routedDetailer.notification_settings?.quoteRequested !== false) {
      try {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_FROM_NUMBER;
        if (accountSid && authToken && fromNumber) {
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
            },
            body: new URLSearchParams({
              From: fromNumber,
              To: routedDetailer.phone,
              Body: `New fleet service request from ${customerName} for ${aircraftLabel} at ${location || 'N/A'}. Check your dashboard.`,
            }).toString(),
          });
        }
      } catch (e) {
        console.error('Failed to send SMS:', e);
      }
    }

    return Response.json({
      success: true,
      request_id: fsr.id,
      routed_to: 'detailer',
      detailer_name: routedDetailer.company || routedDetailer.name,
    });
  }

  // No matching detailer — route to admin
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Shiny Jets CRM <noreply@vectorav.ai>',
        to: 'brett@vectorav.ai',
        subject: 'Fleet Service Request — No Detailer Match',
        text: `A fleet service request came in but no detailer is registered at the aircraft's home airport.\n\nCustomer: ${customerName} (${resolved.customer.email})\nAircraft: ${aircraftLabel}\nHome Airport: ${location || 'Not specified'}\nServices: ${servicesList}\n${preferred_date ? `Preferred Date: ${preferred_date}\n` : ''}${notes ? `Notes: ${notes}\n` : ''}\nPlease route this request manually.`,
      }),
    });
  } catch (e) {
    console.error('Failed to send admin notification:', e);
  }

  return Response.json({
    success: true,
    request_id: fsr.id,
    routed_to: 'admin',
  });
}
