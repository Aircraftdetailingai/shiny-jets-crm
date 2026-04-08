import { createClient } from '@supabase/supabase-js';
import { hashPassword, createToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET — validate token and return invitation info
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return Response.json({ error: 'Invitation token required' }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  // Find team member by invite token
  const { data: member, error } = await supabase
    .from('team_members')
    .select('id, name, email, role, invite_status, invite_sent_at, detailer_id')
    .eq('invite_token', token)
    .single();

  if (error || !member) {
    return Response.json({ error: 'This invitation link is invalid or has already been used.' }, { status: 404 });
  }

  if (member.invite_status === 'accepted') {
    return Response.json({ error: 'This invitation has already been accepted.' }, { status: 400 });
  }

  // Check 7-day expiry
  if (member.invite_sent_at) {
    const sentAt = new Date(member.invite_sent_at);
    const now = new Date();
    const daysSinceSent = (now - sentAt) / (1000 * 60 * 60 * 24);
    if (daysSinceSent > 7) {
      return Response.json({ error: 'This invitation has expired. Please ask your team admin to resend it.' }, { status: 400 });
    }
  }

  // Get detailer/company info
  const { data: detailer } = await supabase
    .from('detailers')
    .select('name, company')
    .eq('id', member.detailer_id)
    .single();

  // Check if this email already has a detailer account
  let existingAccount = false;
  if (member.email) {
    const { data: existing } = await supabase
      .from('detailers')
      .select('id')
      .eq('email', member.email)
      .single();
    existingAccount = !!existing;
  }

  return Response.json({
    name: member.name,
    email: member.email,
    role: member.role,
    company: detailer?.company || detailer?.name || '',
    inviter_name: detailer?.name || detailer?.company || '',
    existing_account: existingAccount,
  });
}

// POST — accept invitation
export async function POST(request) {
  const { token, password } = await request.json();

  if (!token) {
    return Response.json({ error: 'Invitation token required' }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Database not configured' }, { status: 500 });
  }

  // Find team member by invite token
  const { data: member, error: memberErr } = await supabase
    .from('team_members')
    .select('*')
    .eq('invite_token', token)
    .single();

  if (memberErr || !member) {
    return Response.json({ error: 'Invalid invitation token' }, { status: 404 });
  }

  if (member.invite_status === 'accepted') {
    return Response.json({ error: 'This invitation has already been accepted' }, { status: 400 });
  }

  // Check expiry
  if (member.invite_sent_at) {
    const daysSince = (new Date() - new Date(member.invite_sent_at)) / (1000 * 60 * 60 * 24);
    if (daysSince > 7) {
      return Response.json({ error: 'This invitation has expired' }, { status: 400 });
    }
  }

  // Check if email already has an account
  let existingDetailer = null;
  if (member.email) {
    const { data } = await supabase
      .from('detailers')
      .select('id, email, name, company')
      .eq('email', member.email)
      .single();
    existingDetailer = data;
  }

  if (existingDetailer) {
    // Existing account — just mark as accepted and issue a crew token
    await supabase.from('team_members').update({
      invite_status: 'accepted',
      invite_token: null,
    }).eq('id', member.id);

    // Create a crew login token
    const jwtPayload = {
      id: member.id,
      detailer_id: member.detailer_id,
      name: member.name,
      email: member.email,
      role: member.role || 'employee',
      type: 'crew',
    };
    const authToken = await createToken(jwtPayload);

    return Response.json({ success: true, token: authToken });
  }

  // New account — password required
  if (!password || password.length < 8) {
    return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  // Save password on team_members record and mark as accepted
  const { error: updateErr } = await supabase.from('team_members').update({
    password_hash: passwordHash,
    invite_status: 'accepted',
    invite_token: null,
  }).eq('id', member.id);

  if (updateErr) {
    console.error('[invite-accept] Failed to save password:', updateErr.message, updateErr);
    return Response.json({ error: 'Failed to create account: ' + updateErr.message }, { status: 500 });
  }

  // Issue JWT for the crew member
  const jwtPayload = {
    id: member.id,
    detailer_id: member.detailer_id,
    name: member.name,
    email: member.email,
    role: member.role || 'employee',
    type: 'crew',
  };
  const authToken = await createToken(jwtPayload);

  return Response.json({ success: true, token: authToken });
}
