import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
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
