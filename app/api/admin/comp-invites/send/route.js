import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { compInviteTemplate } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const NO_STORE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' };
function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), { status, headers: NO_STORE });
}

// POST /api/admin/comp-invites/send
// Admin-only. Sends the comp-invite welcome email via the existing Resend
// pipeline (lib/email.sendEmail) for one or more pending comp_invites rows.
// Body:
//   { invite_ids: string[] }   — send to these specific ids
//   { all_pending: true }      — send to every comp_invites row WHERE status='pending'
// Returns { results: [{ invite_id, email, ok, error? }] } so the caller can
// see exactly which sends succeeded. Status is NOT mutated — rows stay
// 'pending' until the recipient actually signs up; the redemption helper
// flips them to 'redeemed' at that point.
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return jsonError('Unauthorized', 401);

  const supabase = getSupabase();

  // Authoritative admin check against the database — JWT-claimed admin bits
  // would be untrustworthy. Same pattern as /api/admin/comp-invites POST.
  const { data: caller } = await supabase
    .from('detailers')
    .select('id, email, is_admin')
    .eq('id', user.id)
    .single();
  if (!caller || caller.is_admin !== true) return jsonError('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { body = {}; }

  const inviteIds = Array.isArray(body.invite_ids) ? body.invite_ids.filter(Boolean) : [];
  const allPending = body.all_pending === true;
  if (inviteIds.length === 0 && !allPending) {
    return jsonError('Provide invite_ids: [...] or all_pending: true');
  }

  // Resolve the target set. ALWAYS filter to status='pending' — re-sending
  // to a redeemed invite would tell the recipient they have a comp they
  // already redeemed, which is confusing.
  let query = supabase
    .from('comp_invites')
    .select('id, email, plan, status')
    .eq('status', 'pending');
  if (inviteIds.length > 0) query = query.in('id', inviteIds);
  const { data: invites, error: lookupErr } = await query;
  if (lookupErr) {
    console.error('[admin/comp-invites/send] lookup error:', lookupErr.message);
    return jsonError(lookupErr.message, 500);
  }
  if (!invites || invites.length === 0) {
    return new Response(JSON.stringify({ results: [], note: 'No matching pending invites' }), { status: 200, headers: NO_STORE });
  }

  const results = [];
  for (const inv of invites) {
    try {
      const { subject, html, text } = compInviteTemplate({ email: inv.email });
      await sendEmail({
        to: inv.email,
        subject,
        html,
        text,
        replyTo: 'brett@shinyjets.com',
      });
      console.log(`[admin/comp-invites/send] sent ${inv.id} -> ${inv.email} by ${caller.email}`);
      results.push({ invite_id: inv.id, email: inv.email, ok: true });
    } catch (e) {
      console.error('[admin/comp-invites/send] send failed for', inv.email, e?.message || e);
      results.push({ invite_id: inv.id, email: inv.email, ok: false, error: e?.message || String(e) });
    }
  }

  return new Response(JSON.stringify({ results }), { status: 200, headers: NO_STORE });
}
