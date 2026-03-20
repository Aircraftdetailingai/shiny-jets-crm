import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// Whitelist of fields that can be updated via this generic endpoint
const ALLOWED_FIELDS = [
  'calendly_url',
  'use_calendly_scheduling',
  'chargeback_terms_accepted_at',
];

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const updates = {};
  for (const key of ALLOWED_FIELDS) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from('detailers')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    console.error('Failed to update settings:', error);
    return Response.json({ error: 'Failed to save settings' }, { status: 500 });
  }

  return Response.json({ success: true });
}
