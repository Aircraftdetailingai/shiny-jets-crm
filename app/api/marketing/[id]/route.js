import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Single campaign
export async function GET(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const planGate = await requireFeature(request, 'marketing', { user: user });
    if (planGate) return planGate;

    const supabase = getSupabase();
    const { id } = await params;

    const { data, error } = await supabase
      .from('marketing_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return Response.json({ error: 'Campaign not found' }, { status: 404 });
    if (data.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    return Response.json(data);
  } catch (err) {
    return Response.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}

// PUT - Update campaign
export async function PUT(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const planGate = await requireFeature(request, 'marketing', { user: user });
    if (planGate) return planGate;

    const supabase = getSupabase();
    const { id } = await params;
    const body = await request.json();

    const { data: campaign } = await supabase
      .from('marketing_campaigns')
      .select('detailer_id, status')
      .eq('id', id)
      .single();

    if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });
    if (campaign.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Can't edit sent campaigns
    if (campaign.status === 'sent') {
      return Response.json({ error: 'Cannot edit a sent campaign' }, { status: 400 });
    }

    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.subject !== undefined) updates.subject = body.subject;
    if (body.template_type !== undefined) updates.template_type = body.template_type;
    if (body.content !== undefined) updates.content = body.content;
    if (body.segment !== undefined) updates.segment = body.segment;
    if (body.status !== undefined) updates.status = body.status;
    if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at || null;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('marketing_campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ campaign: data });
  } catch (err) {
    return Response.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(request, { params }) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const planGate = await requireFeature(request, 'marketing', { user: user });
    if (planGate) return planGate;

    const supabase = getSupabase();
    const { id } = await params;

    const { data: campaign } = await supabase
      .from('marketing_campaigns')
      .select('detailer_id')
      .eq('id', id)
      .single();

    if (!campaign) return Response.json({ error: 'Campaign not found' }, { status: 404 });
    if (campaign.detailer_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 });

    await supabase.from('marketing_campaigns').delete().eq('id', id);

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
