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

    const { data: members, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('detailer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Team fetch error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Get time entry stats for each member
    const memberIds = (members || []).map(m => m.id);
    let timeStats = {};

    if (memberIds.length > 0) {
      const { data: entries, error: entriesError } = await supabase
        .from('time_entries')
        .select('team_member_id, hours_worked')
        .in('team_member_id', memberIds);

      if (!entriesError && entries) {
        for (const entry of entries) {
          if (!timeStats[entry.team_member_id]) {
            timeStats[entry.team_member_id] = { total_hours: 0 };
          }
          timeStats[entry.team_member_id].total_hours += parseFloat(entry.hours_worked || 0);
        }
      }
    }

    const membersWithStats = (members || []).map(m => ({
      ...m,
      total_hours: timeStats[m.id]?.total_hours || 0,
      total_pay: (timeStats[m.id]?.total_hours || 0) * parseFloat(m.hourly_pay || 0),
    }));

    return Response.json({ members: membersWithStats });

  } catch (err) {
    console.error('Team API error:', err);
    return Response.json({ error: 'Failed to fetch team members' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    if (!body.name || !body.type) {
      return Response.json({ error: 'Name and type are required' }, { status: 400 });
    }

    if (!['employee', 'contractor'].includes(body.type)) {
      return Response.json({ error: 'Type must be employee or contractor' }, { status: 400 });
    }

    const validRoles = ['owner', 'manager', 'lead_tech', 'employee', 'contractor'];
    const role = validRoles.includes(body.role) ? body.role : body.type;

    const insertData = {
      detailer_id: user.id,
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      type: body.type,
      role,
      hourly_pay: parseFloat(body.hourly_pay) || 0,
      pin_code: body.pin_code || null,
      status: 'active',
    };

    const { data, error } = await supabase
      .from('team_members')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Team create error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data, { status: 201 });

  } catch (err) {
    console.error('Team POST error:', err);
    return Response.json({ error: 'Failed to create team member' }, { status: 500 });
  }
}
