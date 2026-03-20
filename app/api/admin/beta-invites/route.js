import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { sendBetaInviteEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@vectorav.ai',
  'admin@vectorav.ai',
  'brett@shinyjets.com',
];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

// GET — list all invites
export async function GET(request) {
  if (!await isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await supabase
    .from('beta_invites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ invites: data || [] });
}

// POST — create and send invite
export async function POST(request) {
  if (!await isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const { email, plan, duration_days, note } = await request.json();

  if (!email || !plan || !duration_days) {
    return Response.json({ error: 'Email, plan, and duration are required' }, { status: 400 });
  }
  if (!['pro', 'business'].includes(plan)) {
    return Response.json({ error: 'Plan must be pro or business' }, { status: 400 });
  }
  if (![30, 60, 90, 180, 365].includes(Number(duration_days))) {
    return Response.json({ error: 'Duration must be 30, 60, 90, 180, or 365 days' }, { status: 400 });
  }

  const token = crypto.randomUUID();

  const { data, error } = await supabase
    .from('beta_invites')
    .insert({
      email: email.toLowerCase().trim(),
      token,
      plan,
      duration_days: Number(duration_days),
      note: note?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Send invite email
  const emailResult = await sendBetaInviteEmail({
    email: data.email,
    plan,
    durationDays: data.duration_days,
    note: data.note,
    token,
  });

  return Response.json({ invite: data, emailSent: emailResult.success });
}

// PATCH — revoke invite
export async function PATCH(request) {
  if (!await isAdmin(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'DB not configured' }, { status: 500 });

  const { id } = await request.json();
  if (!id) return Response.json({ error: 'Invite ID is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('beta_invites')
    .update({ status: 'revoked' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Invite not found or already used' }, { status: 404 });

  return Response.json({ invite: data });
}
