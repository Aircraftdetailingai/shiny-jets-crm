import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendQuoteSentEmail } from '@/lib/email';
import { sendQuoteSms } from '@/lib/sms';
import { hasPremiumAccess } from '@/lib/pricing-tiers';
import { logActivity, ACTIVITY } from '@/lib/activity-log';
import { calculatePoints, POINTS_ACTIONS, TIER_MULTIPLIERS } from '@/lib/points';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = ['brett@vectorav.ai', 'admin@vectorav.ai', 'brett@shinyjets.com'];

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const supabase = getSupabase();

  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { clientName, clientPhone, clientEmail, clientCompany, customerId, airport, emailSubject, emailBody } = body;
  console.log(`[quote-send] id=${id} to=${clientEmail} subject=${emailSubject?.slice(0, 50)}`);


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

  // Quota enforcement for free plan — block sending if limit reached
  if (quote.status === 'draft') {
    const { data: detailer } = await supabase
      .from('detailers')
      .select('plan')
      .eq('id', user.id)
      .single();

    const plan = detailer?.plan || 'free';
    const { getTier } = await import('@/lib/pricing-tiers');
    const tierConfig = getTier(plan);

    if (tierConfig.quotesPerMonth !== Infinity) {
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count } = await supabase
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('detailer_id', user.id)
        .neq('status', 'draft')
        .gte('created_at', firstOfMonth);

      const quotesThisMonth = count || 0;
      if (quotesThisMonth >= tierConfig.quotesPerMonth) {
        return new Response(JSON.stringify({
          error: 'Monthly quote limit reached. Upgrade to Pro for unlimited quotes.',
          upgrade: true,
          quotesUsed: quotesThisMonth,
          quotesLimit: tierConfig.quotesPerMonth,
        }), { status: 403 });
      }
    }
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

  // Fetch detailer info for email (includes currency for proper formatting)
  // Use column-stripping retry in case sms_enabled or notification_settings don't exist yet
  let detailer = null;
  {
    let detailerCols = 'id, name, email, phone, company, plan, is_admin, notification_settings, sms_enabled, preferred_currency, theme_accent, theme_primary, theme_logo_url, font_heading, font_body';
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error: detErr } = await supabase
        .from('detailers')
        .select(detailerCols)
        .eq('id', user.id)
        .single();
      if (!detErr) {
        detailer = data;
        break;
      }
      const colMatch = detErr.message?.match(/column .*?(\w+).*? does not exist/)
        || detErr.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) {
        console.log(`Detailer fetch: stripping unknown column "${colMatch[1]}", retrying...`);
        detailerCols = detailerCols.replace(new RegExp(',?\\s*' + colMatch[1])).replace(/^,\\s*/);
        continue;
      }
      console.error('Detailer fetch error:', detErr.message || detErr);
      break;
    }
  }
  console.log('Detailer fetched:', detailer ? `plan=${detailer.plan}, is_admin=${detailer.is_admin}, sms_enabled=${detailer.sms_enabled}` : 'NULL - fetch failed!');

  // Fetch customer's preferred language (if they have one saved)
  let customerLanguage = null;
  if (clientEmail) {
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('customer_language')
        .eq('detailer_id', user.id)
        .eq('email', clientEmail.toLowerCase().trim())
        .maybeSingle();
      if (customer?.customer_language) customerLanguage = customer.customer_language;
    } catch (e) {
      // Column may not exist yet — ignore
    }
  }

  // Always use the canonical app URL for quote links sent to customers
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
  const quoteLink = `${appUrl}/q/${quote.share_link}`;
  let emailSent = false;
  let emailError = null;
  let smsSent = false;
  let smsError = null;

  // Send email to customer
  if (clientEmail) {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('placeholder')) {
      console.error('RESEND_API_KEY not configured - cannot send email');
      emailError = 'Email service not configured (RESEND_API_KEY missing)';
    } else {
      try {
        const fromAddr = process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>';
        console.log(`Email: to=${clientEmail}, from=${fromAddr}`);
        const emailQuote = { ...updated, share_link: quote.share_link, client_email: clientEmail };
        const result = await sendQuoteSentEmail({
          quote: emailQuote,
          detailer,
          language: customerLanguage,
          customSubject: emailSubject || null,
          customBody: emailBody || null,
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

  // SMS temporarily disabled pending 10DLC approval
  console.log('=== SMS DISABLED === pending 10DLC approval, skipping SMS send');
  smsError = 'SMS temporarily disabled';

  // Log activity
  if (clientEmail) {
    const aircraft = updated?.aircraft_model || updated?.aircraft_type || 'Aircraft';
    const amount = updated?.total_price ? `$${Number(updated.total_price).toLocaleString()}` : '';
    logActivity({
      detailer_id: user.id,
      customer_email: clientEmail,
      activity_type: ACTIVITY.QUOTE_SENT,
      summary: `Quote sent for ${aircraft} ${amount}`.trim(),
      details: { aircraft, amount: updated?.total_price },
      quote_id: id,
    });
  }

  // Award points for sending a quote
  try {
    const tier = detailer?.plan || 'free';
    const config = POINTS_ACTIONS.SEND_QUOTE;
    const multiplier = TIER_MULTIPLIERS[tier] || 1.0;
    const finalPoints = calculatePoints('SEND_QUOTE', tier);
    await supabase.from('points_ledger').insert({
      detailer_id: user.id,
      action: 'SEND_QUOTE',
      base_points: config.base,
      multiplier,
      final_points: finalPoints,
      description: config.description,
      metadata: { quote_id: id },
    });
    await supabase.rpc('increment_points', { uid: user.id, pts: finalPoints }).catch(() => {
      // Fallback if RPC doesn't exist
      supabase.from('detailers')
        .select('points_balance, points_lifetime')
        .eq('id', user.id)
        .single()
        .then(({ data: d }) => {
          if (d) {
            supabase.from('detailers').update({
              points_balance: (d.points_balance || 0) + finalPoints,
              points_lifetime: (d.points_lifetime || 0) + finalPoints,
            }).eq('id', user.id);
          }
        });
    });
  } catch (e) {
    console.log('Points award skipped:', e.message);
  }

  // In-app notification: quote sent
  try {
    const { createNotification } = await import('@/lib/notifications');
    await createNotification({
      detailerId: user.id,
      type: 'quote_sent',
      title: 'Quote Sent',
      message: `Quote sent to ${clientName || clientEmail} for ${updated?.aircraft_model || updated?.aircraft_type || 'detail'}`,
      link: '/quotes',
      metadata: { quote_id: id },
    });
  } catch {}

  return new Response(JSON.stringify({
    success: true,
    quoteLink,
    emailSent,
    emailError: emailError || undefined,
    smsSent,
    smsError: smsError || undefined,
    customer_id: resolvedCustomerId || undefined,
  }), { status: 200 });
}
