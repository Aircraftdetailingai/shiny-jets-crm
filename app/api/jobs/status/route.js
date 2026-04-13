import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, status } = await request.json();
  if (!job_id || !status) return Response.json({ error: 'job_id and status required' }, { status: 400 });

  const validStatuses = ['scheduled', 'in_progress', 'completed'];
  if (!validStatuses.includes(status)) return Response.json({ error: 'Invalid status' }, { status: 400 });

  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;

  // Try quotes table first (quote-based jobs), then jobs table (manual jobs)
  let job = null;
  let table = 'quotes';

  const { data: quoteJob } = await supabase
    .from('quotes')
    .select('id, detailer_id, status, client_email, client_name, aircraft_model, tail_number, total_price')
    .eq('id', job_id)
    .eq('detailer_id', detailerId)
    .maybeSingle();

  if (quoteJob) {
    job = quoteJob;
    table = 'quotes';
  } else {
    const { data: manualJob } = await supabase
      .from('jobs')
      .select('id, detailer_id, status, customer_email, customer_name, aircraft_model, tail_number, total_price')
      .eq('id', job_id)
      .eq('detailer_id', detailerId)
      .maybeSingle();
    if (manualJob) {
      job = manualJob;
      table = 'jobs';
    }
  }

  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

  console.log(`[jobs/status] ${table} ${job_id} → ${status}`);

  const updates = { status };

  if (status === 'in_progress' && !job.started_at) {
    updates.started_at = new Date().toISOString();
  }

  if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from(table).update(updates).eq('id', job_id);

  if (error) {
    console.error('[jobs/status] Update error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // If completing, check for before/after photos and send email
  const clientEmail = job.client_email || job.customer_email;
  if (status === 'completed' && clientEmail) {
    try {
      const { data: photos } = await supabase
        .from('job_media')
        .select('media_type, url')
        .eq('quote_id', job_id)
        .in('media_type', ['before_photo', 'after_photo'])
        .order('created_at', { ascending: true });

      const beforePhotos = (photos || []).filter(p => p.media_type === 'before_photo').slice(0, 3);
      const afterPhotos = (photos || []).filter(p => p.media_type === 'after_photo').slice(0, 3);

      if (afterPhotos.length > 0) {
        const { data: detailer } = await supabase
          .from('detailers')
          .select('name, company, theme_logo_url')
          .eq('id', user.id)
          .single();

        const companyName = detailer?.company || detailer?.name || 'Your detailer';
        const aircraft = [job.aircraft_model, job.tail_number].filter(Boolean).join(' — ');

        const photoRows = afterPhotos.map((after, i) => {
          const before = beforePhotos[i];
          return `<tr>
            ${before ? `<td style="padding:4px;width:50%;"><img src="${before.url}" style="width:100%;border-radius:6px;" alt="Before"></td>` : ''}
            <td style="padding:4px;width:${before ? '50' : '100'}%;"><img src="${after.url}" style="width:100%;border-radius:6px;" alt="After"></td>
          </tr>`;
        }).join('');

        const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
          <div style="background:linear-gradient(135deg,#007CB1,#0a1520);padding:30px;border-radius:12px 12px 0 0;text-align:center;">
            ${detailer?.theme_logo_url ? `<img src="${detailer.theme_logo_url}" alt="${companyName}" style="height:40px;margin-bottom:12px;">` : `<span style="color:#fff;font-size:24px;font-weight:700;">${companyName}</span>`}
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Your aircraft is ready</p>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
            <h2 style="color:#1a2236;margin:0 0 8px;font-size:18px;">${aircraft || 'Your Aircraft'} — Complete</h2>
            <p style="color:#718096;font-size:14px;margin-bottom:20px;">The detail work on your aircraft has been completed. Here's a look at the results:</p>
            ${beforePhotos.length > 0 ? '<p style="text-align:center;color:#999;font-size:11px;margin-bottom:4px;">Before → After</p>' : ''}
            <table style="width:100%;border-collapse:collapse;">${photoRows}</table>
            <p style="color:#718096;font-size:13px;margin-top:20px;text-align:center;">Thank you for choosing ${companyName}.</p>
          </div>
          <p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">Powered by <a href="https://shinyjets.com" style="color:#aaa;text-decoration:none;">Shiny Jets</a></p>
        </body></html>`;

        await sendEmail({
          to: clientEmail,
          subject: `Your ${aircraft || 'aircraft'} is ready — ${companyName}`,
          html,
          text: `Your aircraft detail is complete. Thank you for choosing ${companyName}.`,
        });
        console.log('[jobs/status] Completion email sent to:', job.client_email);
      }
    } catch (emailErr) {
      console.error('[jobs/status] Completion email error:', emailErr.message);
    }
  }

  console.log(`[jobs/status] Job ${job_id} → ${status}`);
  return Response.json({ success: true, status });
}
