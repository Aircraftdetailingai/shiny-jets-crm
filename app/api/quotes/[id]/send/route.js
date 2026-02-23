import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { sendQuoteSentEmail } from '@/lib/email';
import { sendQuoteSms } from '@/lib/sms';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Get user from either cookie or Authorization header
async function getUser(request) {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get('auth_token')?.value;
  if (authCookie) {
    const user = await verifyToken(authCookie);
    if (user) return user;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }

  return null;
}

export async function POST(request, { params }) {
  const supabase = getSupabase();

  const user = await getUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id } = params;
  const { clientName, clientPhone, clientEmail, clientCompany, customerId, airport } = await request.json();

  // Fetch the quote
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .single();

  if (qErr || !quote) {
    return new Response(JSON.stringify({ error: 'Quote not found' }), { status: 404 });
  }

  if (quote.detailer_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  // Upsert customer record (graceful - skip if table doesn't exist)
  let resolvedCustomerId = customerId || null;
  if (clientEmail) {
    try {
      const { data: existingCustomer, error: lookupErr } = await supabase
        .from('customers')
        .select('id')
        .eq('detailer_id', user.id)
        .eq('email', clientEmail.toLowerCase().trim())
        .maybeSingle();

      // If table doesn't exist, skip customer upsert entirely
      if (lookupErr && (lookupErr.code === '42P01' || lookupErr.code === 'PGRST205')) {
        console.log('Customers table not found, skipping upsert');
      } else if (existingCustomer) {
        resolvedCustomerId = existingCustomer.id;
        // Update existing customer with latest info
        const custUpdates = { updated_at: new Date().toISOString() };
        if (clientName) custUpdates.name = clientName;
        if (clientPhone) custUpdates.phone = clientPhone;
        if (clientCompany !== undefined) custUpdates.company_name = clientCompany || null;
        await supabase
          .from('customers')
          .update(custUpdates)
          .eq('id', existingCustomer.id);
        console.log('Updated existing customer:', existingCustomer.id);
      } else {
        // Create new customer with column-stripping retry
        let custRow = {
          detailer_id: user.id,
          name: clientName || '',
          email: clientEmail.toLowerCase().trim(),
          phone: clientPhone || null,
          company_name: clientCompany || null,
        };
        let newCust = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const { data, error: insertErr } = await supabase
            .from('customers')
            .insert(custRow)
            .select('id')
            .single();
          if (!insertErr) {
            newCust = data;
            break;
          }
          const colMatch = insertErr.message?.match(/column "([^"]+)" of relation "customers" does not exist/)
            || insertErr.message?.match(/Could not find the '([^']+)' column of 'customers'/);
          if (colMatch) {
            console.log(`Customer insert: stripping unknown column "${colMatch[1]}", retrying...`);
            delete custRow[colMatch[1]];
            continue;
          }
          console.error('Customer insert error:', insertErr.message || insertErr);
          break;
        }
        if (newCust) {
          resolvedCustomerId = newCust.id;
          console.log('Created new customer:', newCust.id);
        }
      }
    } catch (e) {
      // Table may not exist yet - that's fine, continue without customer record
      console.log('Customer upsert skipped:', e.message || e);
    }
  }

  // Update quote with client info and status - retry stripping unknown columns
  const now = new Date().toISOString();
  let updateFields = {
    client_name: clientName,
    client_phone: clientPhone || null,
    client_email: clientEmail,
    customer_id: resolvedCustomerId,
    airport: airport || null,
    status: 'sent',
    sent_at: now,
    viewed_at: null,
    view_count: 0,
    last_viewed_at: null,
  };

  let updated = null;
  let updErr = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await supabase
      .from('quotes')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();
    updated = result.data;
    updErr = result.error;

    if (!updErr) break;

    const colMatch = updErr.message?.match(/column "([^"]+)" of relation "quotes" does not exist/)
      || updErr.message?.match(/Could not find the '([^']+)' column of 'quotes'/);
    if (colMatch) {
      console.log(`Quote send: stripping unknown column "${colMatch[1]}", retrying...`);
      delete updateFields[colMatch[1]];
      continue;
    }
    break;
  }

  if (updErr) {
    console.error('Quote send update error:', updErr);
    return new Response(JSON.stringify({ error: updErr.message }), { status: 500 });
  }

  // Fetch detailer info for email
  const { data: detailer } = await supabase
    .from('detailers')
    .select('id, name, email, phone, company, plan, notification_settings, sms_enabled')
    .eq('id', user.id)
    .single();

  // Use request origin for the quote link (works in both dev and prod)
  const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'https://app.vectorav.ai';
  const quoteLink = `${origin}/q/${quote.share_link}`;
  let emailSent = false;
  let emailError = null;
  let smsSent = false;

  // Send email to customer
  if (clientEmail) {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('placeholder')) {
      console.error('RESEND_API_KEY not configured - cannot send email');
      emailError = 'Email service not configured (RESEND_API_KEY missing)';
    } else {
      try {
        const fromAddr = process.env.RESEND_FROM_EMAIL || 'Vector <onboarding@resend.dev>';
        console.log(`Email: to=${clientEmail}, from=${fromAddr}`);
        const emailQuote = { ...updated, share_link: quote.share_link, client_email: clientEmail };
        const result = await sendQuoteSentEmail({
          quote: emailQuote,
          detailer,
        });
        emailSent = result.success;
        if (!result.success) {
          emailError = result.error;
          // Surface Resend domain restriction clearly
          if (result.error?.includes('only send testing emails')) {
            emailError = 'Resend test domain can only send to account owner. Verify your domain at resend.com/domains to send to customers.';
          }
        }
        console.log('Email result:', JSON.stringify(result));
      } catch (e) {
        console.error('Email exception:', e.message);
        emailError = e.message;
      }
    }
  } else {
    console.log('No clientEmail provided, skipping email');
  }

  // Send SMS for business plan
  if (detailer?.plan === 'business' && detailer?.sms_enabled !== false && clientPhone) {
    try {
      const smsResult = await sendQuoteSms({
        clientPhone,
        clientName,
        aircraftDisplay: updated?.aircraft_model || updated?.aircraft_type || 'aircraft',
        quoteLink,
        companyName: detailer.company || detailer.name || '',
      });
      smsSent = smsResult.success;

      if (smsSent) {
        // Schedule follow-ups
        const followups = [];
        const threeDay = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
        followups.push({ quote_id: id, client_phone: clientPhone, followup_type: '3day', scheduled_for: threeDay });

        const settings = detailer.notification_settings || {};
        if (!settings.disable7day) {
          const sevenDay = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          followups.push({ quote_id: id, client_phone: clientPhone, followup_type: '7day', scheduled_for: sevenDay });
        }

        await supabase.from('scheduled_followups').insert(followups);
      }
    } catch (e) {
      console.error('SMS send error:', e);
    }
  }

  return new Response(JSON.stringify({
    success: true,
    quoteLink,
    emailSent,
    emailError: emailError || undefined,
    smsSent,
  }), { status: 200 });
}
