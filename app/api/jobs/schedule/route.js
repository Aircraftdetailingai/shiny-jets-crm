import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendJobScheduledEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { quote_id, scheduled_date } = await request.json();
  if (!quote_id || !scheduled_date) {
    return Response.json({ error: 'quote_id and scheduled_date required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch quote and verify ownership
  const { data: quote, error: fetchErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quote_id)
    .single();

  if (fetchErr || !quote) return Response.json({ error: 'Quote not found' }, { status: 404 });
  if (quote.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

  // Update quote with scheduled_date and status — column-stripping retry
  let updateFields = { scheduled_date, status: 'scheduled' };
  let updated = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('quotes')
      .update(updateFields)
      .eq('id', quote_id)
      .select()
      .single();

    if (!error) { updated = data; break; }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/)
      || error.message?.match(/Could not find the '([^']+)' column/);
    if (colMatch) {
      delete updateFields[colMatch[1]];
      console.log(`[schedule] Stripped missing column '${colMatch[1]}', retrying...`);
      continue;
    }
    console.log('[schedule] Update error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Fetch detailer for branded email
  const { data: detailer } = await supabase
    .from('detailers')
    .select('company, name, email, phone, theme_accent, theme_primary, theme_logo_url, font_heading, font_body')
    .eq('id', user.id)
    .single();

  // Send confirmation email (non-blocking — don't fail the request if email fails)
  let emailSent = false;
  try {
    const result = await sendJobScheduledEmail({
      quote: updated || { ...quote, ...updateFields },
      detailer,
      scheduledDate: scheduled_date,
    });
    emailSent = result?.success || false;
  } catch (e) {
    console.log('[schedule] Email send error:', e.message);
  }

  return Response.json({ success: true, quote: updated, emailSent });
}
