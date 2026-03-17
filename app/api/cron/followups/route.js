import { createClient } from '@supabase/supabase-js';
import {
  sendFollowupNotViewedEmail,
  sendFollowupViewedNotAcceptedEmail,
  sendFollowupExpiryWarningEmail,
} from '@/lib/email';
import { createNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

const DEFAULT_SETTINGS = {
  notViewed: { enabled: true, days: 3 },
  viewedNotAccepted: { enabled: true, days: 5 },
  expiryWarning: { enabled: true, days: 2 },
};

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const now = new Date();
  const results = { notViewed: 0, viewedNotAccepted: 0, expiryWarning: 0, errors: [] };

  try {
    // Fetch all active detailers with their settings
    const { data: detailers } = await supabase
      .from('detailers')
      .select('id, name, company, email, phone, notification_settings, theme_primary, theme_accent, theme_logo_url, font_heading, font_body')
      .eq('status', 'active');

    for (const detailer of detailers || []) {
      const followups = detailer.notification_settings?.followups || {};
      const settings = {
        notViewed: { ...DEFAULT_SETTINGS.notViewed, ...followups.notViewed },
        viewedNotAccepted: { ...DEFAULT_SETTINGS.viewedNotAccepted, ...followups.viewedNotAccepted },
        expiryWarning: { ...DEFAULT_SETTINGS.expiryWarning, ...followups.expiryWarning },
      };

      // ---- 1. NOT VIEWED ----
      if (settings.notViewed.enabled) {
        const cutoff = new Date(now.getTime() - settings.notViewed.days * 86400000).toISOString();
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, client_name, client_email, aircraft_model, aircraft_type, total_price, share_link, valid_until, services')
          .eq('detailer_id', detailer.id)
          .eq('status', 'sent')
          .is('viewed_at', null)
          .lte('sent_at', cutoff)
          .is('followup_notviewed_sent', null);

        for (const quote of quotes || []) {
          try {
            if (!quote.client_email) continue;
            const result = await sendFollowupNotViewedEmail({ quote, detailer });
            if (result.success) {
              await supabase.from('quotes').update({ followup_notviewed_sent: now.toISOString() }).eq('id', quote.id);
              await createNotification({
                detailerId: detailer.id,
                type: 'followup_sent',
                title: 'Follow-up sent: Quote not viewed',
                message: `Reminder sent to ${quote.client_name || 'customer'} — they haven't viewed the ${quote.aircraft_model || 'aircraft'} quote yet.`,
                link: '/quotes',
                metadata: { quote_id: quote.id, followup_type: 'not_viewed' },
              });
              results.notViewed++;
            }
          } catch (e) {
            results.errors.push(`notViewed ${quote.id}: ${e.message}`);
          }
        }
      }

      // ---- 2. VIEWED NOT ACCEPTED ----
      if (settings.viewedNotAccepted.enabled) {
        const cutoff = new Date(now.getTime() - settings.viewedNotAccepted.days * 86400000).toISOString();
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, client_name, client_email, aircraft_model, aircraft_type, total_price, share_link, valid_until, viewed_at, services')
          .eq('detailer_id', detailer.id)
          .in('status', ['sent', 'viewed'])
          .not('viewed_at', 'is', null)
          .is('accepted_at', null)
          .lte('viewed_at', cutoff)
          .is('followup_viewednotaccepted_sent', null);

        for (const quote of quotes || []) {
          try {
            if (!quote.client_email) continue;
            const result = await sendFollowupViewedNotAcceptedEmail({ quote, detailer });
            if (result.success) {
              await supabase.from('quotes').update({ followup_viewednotaccepted_sent: now.toISOString() }).eq('id', quote.id);
              await createNotification({
                detailerId: detailer.id,
                type: 'followup_sent',
                title: 'Follow-up sent: Viewed, not booked',
                message: `Reminder sent to ${quote.client_name || 'customer'} — they viewed the ${quote.aircraft_model || 'aircraft'} quote but haven't booked.`,
                link: '/quotes',
                metadata: { quote_id: quote.id, followup_type: 'viewed_not_accepted' },
              });
              results.viewedNotAccepted++;
            }
          } catch (e) {
            results.errors.push(`viewedNotAccepted ${quote.id}: ${e.message}`);
          }
        }
      }

      // ---- 3. EXPIRY WARNING ----
      if (settings.expiryWarning.enabled) {
        const warningDate = new Date(now.getTime() + settings.expiryWarning.days * 86400000).toISOString();
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, client_name, client_email, aircraft_model, aircraft_type, total_price, share_link, valid_until, services')
          .eq('detailer_id', detailer.id)
          .in('status', ['sent', 'viewed'])
          .not('valid_until', 'is', null)
          .lte('valid_until', warningDate)
          .gt('valid_until', now.toISOString())
          .is('followup_expirywarning_sent', null);

        for (const quote of quotes || []) {
          try {
            if (!quote.client_email) continue;
            const result = await sendFollowupExpiryWarningEmail({ quote, detailer });
            if (result.success) {
              await supabase.from('quotes').update({ followup_expirywarning_sent: now.toISOString() }).eq('id', quote.id);
              await createNotification({
                detailerId: detailer.id,
                type: 'followup_sent',
                title: 'Follow-up sent: Quote expiring soon',
                message: `Expiry warning sent to ${quote.client_name || 'customer'} for the ${quote.aircraft_model || 'aircraft'} quote.`,
                link: '/quotes',
                metadata: { quote_id: quote.id, followup_type: 'expiry_warning' },
              });
              results.expiryWarning++;
            }
          } catch (e) {
            results.errors.push(`expiryWarning ${quote.id}: ${e.message}`);
          }
        }
      }
    }
  } catch (err) {
    console.error('Followup cron error:', err);
    results.errors.push(err.message);
  }

  return Response.json({
    success: true,
    ...results,
    total: results.notViewed + results.viewedNotAccepted + results.expiryWarning,
    timestamp: now.toISOString(),
  });
}
