import { createClient } from '@supabase/supabase-js';
import {
  sendFollowUpReminderEmail,
  sendExpiryDiscountEmail,
} from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { sendSms } from '@/lib/sms';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date();
  const results = { notifications: 0, reminderEmails: 0, discountEmails: 0, sms: 0, errors: [] };

  try {
    // ======================================================
    // 1. ENGAGEMENT-BASED DETAILER NOTIFICATIONS
    // ======================================================

    // 1a. "Customer hasn't opened email (2 days)" — suggest resend or call
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000).toISOString();
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000).toISOString();

    const { data: unopenedQuotes } = await supabase
      .from('quotes')
      .select('id, client_name, client_email, aircraft_model, total_price, detailer_id, sent_at, share_link')
      .eq('status', 'sent')
      .is('viewed_at', null)
      .lte('sent_at', twoDaysAgo)
      .gte('sent_at', new Date(now.getTime() - 5 * 86400000).toISOString()) // Don't re-notify for very old quotes
      .is('followup_unopened_notified', null);

    for (const q of unopenedQuotes || []) {
      try {
        await createNotification({
          detailerId: q.detailer_id,
          type: 'followup_needed',
          title: 'Quote not opened',
          message: `${q.client_name || 'Customer'} hasn't opened the quote for ${q.aircraft_model || 'their aircraft'} (sent 2+ days ago). Consider resending or calling.`,
          link: `/quotes`,
          metadata: { quote_id: q.id, reason: 'unopened_2days' },
        });
        await supabase.from('quotes').update({ followup_unopened_notified: now.toISOString() }).eq('id', q.id);
        results.notifications++;
      } catch (e) {
        results.errors.push(`unopened notify ${q.id}: ${e.message}`);
      }
    }

    // 1b. "Customer viewed but hasn't booked (3 days)" — prompt follow up
    const { data: viewedNotBooked } = await supabase
      .from('quotes')
      .select('id, client_name, client_email, aircraft_model, total_price, detailer_id, viewed_at, view_count, share_link')
      .eq('status', 'viewed')
      .not('viewed_at', 'is', null)
      .lte('viewed_at', threeDaysAgo)
      .gte('viewed_at', new Date(now.getTime() - 7 * 86400000).toISOString())
      .is('followup_viewed_notified', null);

    for (const q of viewedNotBooked || []) {
      try {
        const views = q.view_count || 1;
        await createNotification({
          detailerId: q.detailer_id,
          type: 'followup_needed',
          title: 'Interested but not booked',
          message: `${q.client_name || 'Customer'} viewed the quote for ${q.aircraft_model || 'their aircraft'} ${views > 1 ? `${views} times` : ''} but hasn't booked. A quick follow-up could close this deal.`,
          link: `/quotes`,
          metadata: { quote_id: q.id, reason: 'viewed_not_booked', view_count: views },
        });
        await supabase.from('quotes').update({ followup_viewed_notified: now.toISOString() }).eq('id', q.id);
        results.notifications++;
      } catch (e) {
        results.errors.push(`viewed notify ${q.id}: ${e.message}`);
      }
    }

    // ======================================================
    // 2. EXPIRY REMINDER (5 days before)
    // ======================================================
    const fiveDaysFromNow = new Date(now.getTime() + 5 * 86400000).toISOString();
    const fourDaysFromNow = new Date(now.getTime() + 4 * 86400000).toISOString();

    const { data: expiringIn5 } = await supabase
      .from('quotes')
      .select('id, client_name, client_email, client_phone, aircraft_model, total_price, detailer_id, share_link, valid_until')
      .in('status', ['sent', 'viewed'])
      .gte('valid_until', fourDaysFromNow)
      .lte('valid_until', fiveDaysFromNow)
      .is('followup_5day_sent', null);

    for (const q of expiringIn5 || []) {
      try {
        // Fetch detailer info for email
        const { data: detailer } = await supabase
          .from('detailers')
          .select('name, company, email, phone, notification_settings, sms_enabled, plan')
          .eq('id', q.detailer_id)
          .single();

        const contactPref = await getContactPreference(supabase, q.detailer_id, q.client_email);
        const quoteUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.vectorav.ai'}/q/${q.share_link}`;

        // Send reminder email (unless customer prefers SMS only)
        if (contactPref !== 'sms' && q.client_email) {
          await sendFollowUpReminderEmail({
            to: q.client_email,
            clientName: q.client_name,
            aircraft: q.aircraft_model,
            quoteUrl,
            expiresIn: '5 days',
            detailerName: detailer?.name || detailer?.company || 'Your detailer',
            detailerPhone: detailer?.phone,
          });
          results.reminderEmails++;
        }

        // Send SMS if preferred and enabled
        if ((contactPref === 'sms' || contactPref === 'both') && q.client_phone && detailer?.sms_enabled !== false) {
          try {
            await sendSms({
              to: q.client_phone,
              body: `Hi ${q.client_name || 'there'}, just a reminder - your quote for the ${q.aircraft_model || 'aircraft detail'} expires in 5 days. View it here: ${quoteUrl} - ${detailer?.name || ''}`,
            });
            results.sms++;
          } catch (e) { /* SMS failures non-blocking */ }
        }

        // Notify detailer
        await createNotification({
          detailerId: q.detailer_id,
          type: 'followup_needed',
          title: 'Quote expires in 5 days',
          message: `${q.client_name || 'Customer'}'s quote for ${q.aircraft_model || 'aircraft'} expires in 5 days. Reminder sent to customer.`,
          link: `/quotes`,
          metadata: { quote_id: q.id, reason: 'expiry_5day' },
        });

        await supabase.from('quotes').update({ followup_5day_sent: now.toISOString() }).eq('id', q.id);
        results.notifications++;
      } catch (e) {
        results.errors.push(`5day reminder ${q.id}: ${e.message}`);
      }
    }

    // ======================================================
    // 3. EXPIRY DISCOUNT (2 days before)
    // ======================================================
    const twoDaysFromNow = new Date(now.getTime() + 2 * 86400000).toISOString();
    const oneDayFromNow = new Date(now.getTime() + 1 * 86400000).toISOString();

    const { data: expiringIn2 } = await supabase
      .from('quotes')
      .select('id, client_name, client_email, client_phone, aircraft_model, total_price, detailer_id, share_link, valid_until')
      .in('status', ['sent', 'viewed'])
      .gte('valid_until', oneDayFromNow)
      .lte('valid_until', twoDaysFromNow)
      .is('followup_discount_sent', null);

    for (const q of expiringIn2 || []) {
      try {
        const { data: detailer } = await supabase
          .from('detailers')
          .select('name, company, email, phone, notification_settings, sms_enabled, plan, followup_discount_percent')
          .eq('id', q.detailer_id)
          .single();

        const settings = detailer?.notification_settings || {};
        // Check if auto-discount is enabled (opt-in)
        if (!settings.autoDiscountEnabled) {
          await supabase.from('quotes').update({ followup_discount_sent: 'skipped' }).eq('id', q.id);
          continue;
        }

        const discountPct = detailer?.followup_discount_percent || 10;
        const originalPrice = q.total_price || 0;
        const discountedPrice = Math.round(originalPrice * (1 - discountPct / 100) * 100) / 100;
        const contactPref = await getContactPreference(supabase, q.detailer_id, q.client_email);
        const quoteUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://app.vectorav.ai'}/q/${q.share_link}`;

        // Send discount email
        if (contactPref !== 'sms' && q.client_email) {
          await sendExpiryDiscountEmail({
            to: q.client_email,
            clientName: q.client_name,
            aircraft: q.aircraft_model,
            quoteUrl,
            discountPercent: discountPct,
            originalPrice,
            discountedPrice,
            detailerName: detailer?.name || detailer?.company || 'Your detailer',
            detailerPhone: detailer?.phone,
          });
          results.discountEmails++;
        }

        // Send discount SMS
        if ((contactPref === 'sms' || contactPref === 'both') && q.client_phone && detailer?.sms_enabled !== false) {
          try {
            await sendSms({
              to: q.client_phone,
              body: `Hi ${q.client_name || 'there'}, your quote expires soon! Book today and save ${discountPct}% on your ${q.aircraft_model || 'aircraft'} detail. View: ${quoteUrl} - ${detailer?.name || ''}`,
            });
            results.sms++;
          } catch (e) { /* non-blocking */ }
        }

        // Notify detailer about discount sent
        await createNotification({
          detailerId: q.detailer_id,
          type: 'followup_needed',
          title: `${discountPct}% discount offer sent`,
          message: `Sent a ${discountPct}% discount offer to ${q.client_name || 'customer'} for ${q.aircraft_model || 'aircraft'} (quote expires in 2 days).`,
          link: `/quotes`,
          metadata: { quote_id: q.id, reason: 'expiry_discount', discount: discountPct },
        });

        await supabase.from('quotes').update({ followup_discount_sent: now.toISOString() }).eq('id', q.id);
        results.notifications++;
      } catch (e) {
        results.errors.push(`discount ${q.id}: ${e.message}`);
      }
    }

  } catch (err) {
    console.error('Smart followup cron error:', err);
    results.errors.push(err.message);
  }

  return Response.json({
    success: true,
    ...results,
    timestamp: now.toISOString(),
  });
}

/**
 * Get customer's contact preference.
 * Falls back to 'email' if not set.
 */
async function getContactPreference(supabase, detailerId, email) {
  if (!email) return 'email';
  try {
    const { data } = await supabase
      .from('customers')
      .select('contact_preference')
      .eq('detailer_id', detailerId)
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();
    return data?.contact_preference || 'email';
  } catch {
    return 'email';
  }
}
