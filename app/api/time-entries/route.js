import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const teamMemberId = searchParams.get('team_member_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    let query = supabase
      .from('time_entries')
      .select('*, team_members(name, type, hourly_pay)')
      .eq('detailer_id', user.id)
      .order('date', { ascending: false })
      .limit(500);

    if (teamMemberId) {
      query = query.eq('team_member_id', teamMemberId);
    }
    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Time entries fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ entries: data || [] });

  } catch (err) {
    console.error('Time entries API error:', err);
    return Response.json({ error: 'Failed to fetch time entries' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();

    let detailerId;
    let teamMemberId;

    // PIN-based auth (for /time-log page)
    if (body.pin_code) {
      const { data: member, error: pinError } = await supabase
        .from('team_members')
        .select('id, detailer_id, name')
        .eq('pin_code', body.pin_code)
        .eq('status', 'active')
        .single();

      if (pinError || !member) {
        return Response.json({ error: 'Invalid PIN' }, { status: 401 });
      }

      teamMemberId = member.id;
      detailerId = member.detailer_id;
    } else {
      // Normal authenticated request
      const user = await getAuthUser(request);
      if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      detailerId = user.id;
      teamMemberId = body.team_member_id;

      if (!teamMemberId) {
        return Response.json({ error: 'team_member_id is required' }, { status: 400 });
      }

      // Verify the team member belongs to this detailer
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('id', teamMemberId)
        .eq('detailer_id', user.id)
        .single();

      if (!member) {
        return Response.json({ error: 'Team member not found' }, { status: 404 });
      }
    }

    if (!body.date || !body.hours_worked) {
      return Response.json({ error: 'Date and hours_worked are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        team_member_id: teamMemberId,
        detailer_id: detailerId,
        quote_id: body.quote_id || null,
        date: body.date,
        hours_worked: parseFloat(body.hours_worked),
        service_type: body.service_type || null,
        notes: body.notes || null,
        approved: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Time entry create error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data, { status: 201 });

  } catch (err) {
    console.error('Time entries POST error:', err);
    return Response.json({ error: 'Failed to create time entry' }, { status: 500 });
  }
}
