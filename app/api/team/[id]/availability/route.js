import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'team', { user: user });
  if (planGate) return planGate;

  const { id } = params;
  const supabase = getSupabase();

  const { data: member } = await supabase
    .from('team_members')
    .select('id, availability, name')
    .eq('id', id)
    .eq('detailer_id', user.detailer_id || user.id)
    .single();

  if (!member) return Response.json({ error: 'Team member not found' }, { status: 404 });

  return Response.json({ availability: member.availability, name: member.name });
}

export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'team', { user: user });
  if (planGate) return planGate;

  const { id } = params;
  const { availability } = await request.json();
  const supabase = getSupabase();

  // Verify ownership
  const { data: member } = await supabase
    .from('team_members')
    .select('id')
    .eq('id', id)
    .eq('detailer_id', user.detailer_id || user.id)
    .single();

  if (!member) return Response.json({ error: 'Team member not found' }, { status: 404 });

  const { error } = await supabase
    .from('team_members')
    .update({ availability })
    .eq('id', id);

  if (error) {
    console.error('Failed to update team member availability:', error);
    return Response.json({ error: 'Failed to save' }, { status: 500 });
  }

  return Response.json({ success: true });
}
