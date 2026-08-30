import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendCrewBriefing } from '@/lib/send-crew-briefing';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const detailerId = user.detailer_id || user.id;
  const { id: jobId } = await params;

  let parsedBody = {};
  try { parsedBody = await request.json(); } catch (_) { /* empty body is fine */ }
  const forceResend = parsedBody?.resend === true;

  const supabase = getSupabase();
  const result = await sendCrewBriefing(supabase, { detailerId, jobId, forceResend });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status || 500 });
  }

  if (result.already_sent) {
    return Response.json({
      ok: true,
      success: true,
      already_sent: true,
      sent_at: result.sent_at,
      channels: result.channels || [],
      sent: 0,
      message: 'Briefing already sent. Pass { resend: true } to send again.',
    }, { status: 200 });
  }

  return Response.json({
    ok: true,
    success: true,
    sent: result.sent,
    emails: result.emails,
    channels: result.channels,
    sent_at: result.sent_at,
  });
}
