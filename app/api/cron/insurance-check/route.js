import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== process.env.CRON_SECRET) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabase();
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  let reminded = 0, expired = 0;

  // Expiring within 30 days — send reminder
  const { data: expiring } = await supabase
    .from('detailers')
    .select('id, email, company, insurance_expiry_date')
    .eq('insurance_verified', true)
    .lte('insurance_expiry_date', in30Days)
    .gt('insurance_expiry_date', today);

  for (const d of (expiring || [])) {
    if (d.email && process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
            to: d.email,
            subject: `Insurance expiring soon — ${d.company || 'Your Business'}`,
            html: `<div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
              <h2 style="color:#333;">Insurance Expiring Soon</h2>
              <p>Your certificate of insurance expires on <strong>${new Date(d.insurance_expiry_date).toLocaleDateString()}</strong>.</p>
              <p>Upload your new certificate to keep your directory listing active.</p>
              <a href="https://crm.shinyjets.com/settings/directory" style="display:inline-block;background:#007CB1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:12px;">Update Insurance</a>
            </div>`,
          }),
        });
        reminded++;
      } catch {}
    }
  }

  // Already expired — set insurance_verified = false
  const { data: expiredList } = await supabase
    .from('detailers')
    .select('id, email, company')
    .eq('insurance_verified', true)
    .lte('insurance_expiry_date', today);

  for (const d of (expiredList || [])) {
    await supabase.from('detailers').update({ insurance_verified: false }).eq('id', d.id);
    expired++;
    if (d.email && process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
            to: d.email,
            subject: `Insurance expired — listing hidden`,
            html: `<div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
              <h2 style="color:#dc2626;">Insurance Expired</h2>
              <p>Your certificate of insurance has expired. Your directory listing has been hidden.</p>
              <p>Upload a new certificate to restore your listing.</p>
              <a href="https://crm.shinyjets.com/settings/directory" style="display:inline-block;background:#007CB1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:12px;">Upload New Certificate</a>
            </div>`,
          }),
        });
      } catch {}
    }
  }

  return Response.json({ reminded, expired });
}
