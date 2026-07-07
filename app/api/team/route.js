import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendTeamInviteEmail, sendTeamAddedEmail } from '@/lib/email';
import crypto from 'crypto';

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
      .eq('detailer_id', user.detailer_id || user.id)
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

    // Generate invite token if email provided
    const inviteToken = body.email ? crypto.randomUUID() : null;

    const insertData = {
      detailer_id: user.detailer_id || user.id,
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      type: body.type,
      role,
      hourly_pay: parseFloat(body.hourly_pay) || 0,
      pin_code: body.pin_code || null,
      specialties: Array.isArray(body.specialties) ? body.specialties : [],
      status: 'active',
      invite_token: inviteToken,
      invite_status: body.email ? 'pending' : 'not_invited',
    };

    // Reject a duplicate active PIN within this detailer before insert. The DB
    // partial unique index enforces the same rule — a violation there is caught
    // below and returned as the same friendly 409, never a raw 500.
    if (insertData.pin_code) {
      const { data: pinClash, error: pinChkErr } = await supabase
        .from('team_members')
        .select('id')
        .eq('detailer_id', insertData.detailer_id)
        .eq('pin_code', insertData.pin_code)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (pinChkErr) {
        console.error('[team POST] PIN conflict check failed:', pinChkErr.message);
        return Response.json({ error: 'Failed to add team member' }, { status: 500 });
      }
      if (pinClash) {
        return Response.json({ error: 'That PIN is already used by another active team member — choose a different one', code: 'pin_taken' }, { status: 409 });
      }
    }

    const { data, error } = await supabase
      .from('team_members')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Team create error:', error);
      if (error.code === '23505' || /team_members_active_pin_per_detailer|duplicate key/i.test(error.message || '')) {
        return Response.json({ error: 'That PIN is already used by another active team member — choose a different one', code: 'pin_taken' }, { status: 409 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Send invite email if email provided
    if (body.email && inviteToken) {
      // Get detailer info for the invite
      const { data: detailer } = await supabase
        .from('detailers')
        .select('name, company')
        .eq('id', user.id)
        .single();

      // Check if this email already has an account
      const { data: existingAccount } = await supabase
        .from('detailers')
        .select('id')
        .eq('email', body.email)
        .single();

      if (existingAccount) {
        // Existing account — auto-accept and send notification instead of invite
        await supabase.from('team_members').update({
          invite_status: 'accepted',
          invite_token: null,
          invite_sent_at: new Date().toISOString(),
        }).eq('id', data.id);

        try {
          await sendTeamAddedEmail({
            to: body.email,
            memberName: body.name,
            company: detailer?.company || detailer?.name || 'the team',
          });
          console.log('[team/invite] Team-added notification sent to existing account:', body.email);
        } catch (emailErr) {
          console.error('[team/invite] Team-added email error:', emailErr.message);
        }

        return Response.json(data, { status: 201 });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
      const inviteUrl = `${appUrl}/invite/${inviteToken}`;

      console.log('[team/invite] Sending invite email to:', body.email, 'invite URL:', inviteUrl);

      try {
        const result = await sendTeamInviteEmail({
          to: body.email,
          memberName: body.name,
          inviterName: detailer?.name || detailer?.company || 'Your team leader',
          company: detailer?.company || detailer?.name || 'the team',
          role,
          inviteUrl,
        });

        if (result?.success !== false) {
          await supabase.from('team_members').update({
            invite_sent_at: new Date().toISOString(),
          }).eq('id', data.id);
          console.log('[team/invite] Email sent successfully to:', body.email);
        } else {
          console.error('[team/invite] Email send failed:', result?.error);
        }
      } catch (emailErr) {
        console.error('[team/invite] Email error:', emailErr.message);
      }
    }

    return Response.json(data, { status: 201 });

  } catch (err) {
    console.error('Team POST error:', err);
    return Response.json({ error: 'Failed to create team member' }, { status: 500 });
  }
}

// PATCH - Resend invite email
export async function PATCH(request) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const user = await getAuthUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { member_id } = await request.json();
    if (!member_id) {
      return Response.json({ error: 'member_id required' }, { status: 400 });
    }

    // Get team member
    const { data: member, error: memberErr } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', member_id)
      .eq('detailer_id', user.detailer_id || user.id)
      .single();

    if (memberErr || !member) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    if (!member.email) {
      return Response.json({ error: 'No email on file for this team member' }, { status: 400 });
    }

    // Generate new token if none exists
    let token = member.invite_token;
    if (!token) {
      token = crypto.randomUUID();
      await supabase.from('team_members').update({ invite_token: token }).eq('id', member.id);
    }

    // Get detailer info
    const { data: detailer } = await supabase
      .from('detailers')
      .select('name, company')
      .eq('id', user.id)
      .single();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.shinyjets.com';
    const inviteUrl = `${appUrl}/invite/${token}`;

    const result = await sendTeamInviteEmail({
      to: member.email,
      memberName: member.name,
      inviterName: detailer?.name || detailer?.company || 'Your team leader',
      company: detailer?.company || detailer?.name || 'the team',
      role: member.role,
      inviteUrl,
    });

    if (result?.success === false) {
      return Response.json({ error: result.error || 'Failed to send email' }, { status: 500 });
    }

    await supabase.from('team_members').update({
      invite_sent_at: new Date().toISOString(),
      invite_status: 'pending',
    }).eq('id', member.id);

    console.log('[team/resend] Invite resent to:', member.email);

    return Response.json({ success: true, message: `Invite sent to ${member.email}` });

  } catch (err) {
    console.error('Team PATCH error:', err);
    return Response.json({ error: 'Failed to resend invite' }, { status: 500 });
  }
}
