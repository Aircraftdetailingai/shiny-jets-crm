import { createClient } from '@supabase/supabase-js';

// Single audit-write helper used by every customer-facing email send site.
// Inserts a row into notification_log capturing recipient, type, outcome,
// and (critically) the Resend message id so we can cross-reference back to
// the Resend dashboard. Uses column-stripping retry — matches the broader
// codebase pattern — so this never breaks a send if a column is missing on
// a given deploy. Never throws; failures are logged and swallowed.
//
// Brett's spec: "wrap every customer-facing send in a try/finally that
// writes to notification_log". This helper IS that wrapper — call it after
// the Resend response is known, regardless of success/failure.
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function logNotification({
  detailer_id,
  notification_type,
  recipient,
  channel = 'email',
  status = 'sent',
  resend_id = null,
  error_message = null,
  message_preview = null,
  quote_id = null,
  invoice_id = null,
  lead_id = null,
}) {
  if (!detailer_id || !notification_type) {
    console.warn('[notification-log] missing detailer_id or notification_type, skipping');
    return { logged: false, reason: 'missing_required_field' };
  }

  const supabase = getSupabase();
  if (!supabase) return { logged: false, reason: 'no_supabase_env' };

  let row = {
    detailer_id,
    notification_type,
    channel,
    recipient: recipient || null,
    status,
    resend_id: resend_id || null,
    error_message: error_message || null,
    message_preview: message_preview ? String(message_preview).slice(0, 80) : null,
    quote_id: quote_id || null,
    invoice_id: invoice_id || null,
    lead_id: lead_id || null,
    sent_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase.from('notification_log').insert(row);
    if (!error) return { logged: true };

    const colMatch =
      error.message?.match(/column "([^"]+)" of relation "notification_log" does not exist/) ||
      error.message?.match(/Could not find the '([^']+)' column of 'notification_log'/);
    if (colMatch && row[colMatch[1]] !== undefined) {
      delete row[colMatch[1]];
      continue;
    }

    console.warn('[notification-log] insert failed:', error.message);
    return { logged: false, reason: error.message };
  }
  return { logged: false, reason: 'max_retries' };
}
