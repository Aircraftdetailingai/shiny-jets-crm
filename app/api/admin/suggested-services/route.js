import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
  'brett@vectorav.ai',
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

// GET - List suggested services with optional status filter
export async function GET(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('suggested_services')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (status) query = query.eq('status', status);

    const { data: suggestions, error } = await query;

    if (error) {
      console.error('Suggested services query error:', error);
      return Response.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
    }

    return Response.json({ suggestions: suggestions || [] });
  } catch (err) {
    console.error('Suggested services error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Approve or reject a suggested service
export async function POST(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const { id, status, admin_notes } = await request.json();
    if (!id || !['approved', 'rejected'].includes(status)) {
      return Response.json({ error: 'id and status (approved/rejected) required' }, { status: 400 });
    }

    const updates = { status };
    if (admin_notes) updates.admin_notes = admin_notes;

    const { error } = await supabase
      .from('suggested_services')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Update suggested service error:', error);
      return Response.json({ error: 'Failed to update' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('Suggested service update error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
