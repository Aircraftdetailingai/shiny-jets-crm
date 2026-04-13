import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET - Fetch assignments for a specific job
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  const supabase = getSupabase();
  const detailerId = user.detailer_id || user.id;

  // Fetch from job_assignments table (works for both jobs and quotes)
  const { data: rows } = await supabase
    .from('job_assignments')
    .select('id, job_id, team_member_id, status, notified_at, accepted_at')
    .eq('job_id', id)
    .eq('detailer_id', detailerId);

  // Resolve team member names
  const memberIds = [...new Set((rows || []).map(r => r.team_member_id).filter(Boolean))];
  let membersById = {};
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from('team_members')
      .select('id, name, title, phone, email')
      .in('id', memberIds);
    for (const m of (members || [])) membersById[m.id] = m;
  }

  const assignments = (rows || []).map(r => ({
    ...r,
    member_name: membersById[r.team_member_id]?.name || 'Unknown',
    member_title: membersById[r.team_member_id]?.title || null,
  }));

  return Response.json({ assignments });
}

// POST - Assign team members to a job (quote)
export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;
  const { teamMemberIds } = await request.json();

  if (!id || !Array.isArray(teamMemberIds)) {
    return Response.json({ error: 'Job ID and teamMemberIds array required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify quote belongs to this detailer
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id, detailer_id')
    .eq('id', id)
    .eq('detailer_id', user.id)
    .single();

  if (quoteError || !quote) {
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  // Update assigned team members
  const { error: updateError } = await supabase
    .from('quotes')
    .update({ assigned_team_member_ids: teamMemberIds })
    .eq('id', id);

  if (updateError) {
    console.error('[assign] update error:', updateError.message);
    return Response.json({ error: 'Failed to assign team' }, { status: 500 });
  }

  // Auto-resolve any staffing alert for this quote
  if (teamMemberIds.length > 0) {
    await supabase
      .from('staffing_alerts')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .eq('quote_id', id)
      .eq('resolved', false)
      .catch(() => {});
  }

  return Response.json({ success: true, assigned_team_member_ids: teamMemberIds });
}
