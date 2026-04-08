import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}

// POST — crew submits a change order request
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { job_id, quote_id, photo_url, description } = await request.json();
  if (!description) return Response.json({ error: 'Description required' }, { status: 400 });

  const supabase = getSupabase();
  const detailerId = user.detailer_id;

  const { data, error } = await supabase.from('change_order_requests').insert({
    job_id: job_id || null,
    quote_id: quote_id || null,
    detailer_id: detailerId,
    team_member_id: user.id,
    team_member_name: user.name,
    photo_url: photo_url || null,
    description,
    status: 'pending_review',
  }).select().single();

  if (error) {
    console.error('[change-order-request] Insert error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Create in-app notification for owner
  try {
    await supabase.from('notifications').insert({
      detailer_id: detailerId,
      type: 'change_order_request',
      title: 'Change Order Request',
      message: `${user.name} reported an issue: ${description.slice(0, 100)}`,
      link: '/dashboard',
      metadata: { change_order_request_id: data.id, job_id },
    });
  } catch {}

  // Email owner
  try {
    const { data: detailer } = await supabase.from('detailers').select('email, company').eq('id', detailerId).single();
    if (detailer?.email && process.env.RESEND_API_KEY) {
      const photoHtml = photo_url ? `<img src="${photo_url}" alt="Issue" style="max-width:100%;border-radius:8px;margin:12px 0;" />` : '';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'Shiny Jets CRM <noreply@mail.shinyjets.com>',
          to: detailer.email,
          subject: `Change Order Request — ${user.name} found an issue`,
          html: `<div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
            <h2 style="color:#007CB1;">Change Order Request</h2>
            <p><strong>${user.name}</strong> reported an issue that may require additional work.</p>
            ${photoHtml}
            <div style="background:#f5f5f5;padding:12px;border-radius:8px;margin:12px 0;">
              <p style="margin:0;">${description}</p>
            </div>
            <a href="https://crm.shinyjets.com/dashboard" style="display:inline-block;background:#007CB1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:12px;">Review in Dashboard</a>
          </div>`,
        }),
      });
    }
  } catch (emailErr) {
    console.error('[change-order-request] Email error:', emailErr);
  }

  return Response.json({ success: true, id: data.id });
}
