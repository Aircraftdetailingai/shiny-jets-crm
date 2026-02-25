import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data: member, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', id)
      .eq('detailer_id', user.id)
      .single();

    if (error || !member) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Get their time entries
    const { data: entries, error: entriesError } = await supabase
      .from('time_entries')
      .select('*')
      .eq('team_member_id', id)
      .order('date', { ascending: false });

    if (entriesError) {
      console.error('Time entries fetch error:', entriesError);
    }

    const timeEntries = entries || [];
    const totalHours = timeEntries.reduce((sum, e) => sum + parseFloat(e.hours_worked || 0), 0);
    const totalPay = totalHours * parseFloat(member.hourly_pay || 0);

    return Response.json({
      member,
      time_entries: timeEntries,
      stats: { total_hours: totalHours, total_pay: totalPay },
    });

  } catch (err) {
    console.error('Team GET error:', err);
    return Response.json({ error: 'Failed to fetch team member' }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('id', id)
      .eq('detailer_id', user.id)
      .single();

    if (!existing) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    const updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.type !== undefined) {
      if (!['employee', 'contractor'].includes(body.type)) {
        return Response.json({ error: 'Type must be employee or contractor' }, { status: 400 });
      }
      updates.type = body.type;
    }
    if (body.hourly_pay !== undefined) updates.hourly_pay = parseFloat(body.hourly_pay) || 0;
    if (body.status !== undefined) updates.status = body.status;
    if (body.pin_code !== undefined) updates.pin_code = body.pin_code;
    if (body.role !== undefined) {
      const validRoles = ['owner', 'manager', 'lead_tech', 'employee', 'contractor'];
      if (validRoles.includes(body.role)) updates.role = body.role;
    }

    const { data, error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Team update error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data);

  } catch (err) {
    console.error('Team PATCH error:', err);
    return Response.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('team_members')
      .select('id')
      .eq('id', id)
      .eq('detailer_id', user.id)
      .single();

    if (!existing) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Team delete error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('Team DELETE error:', err);
    return Response.json({ error: 'Failed to delete team member' }, { status: 500 });
  }
}
