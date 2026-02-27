import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

async function getUser(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth_token')?.value;
    if (authCookie) {
      const user = await verifyToken(authCookie);
      if (user) return user;
    }
  } catch (e) {}
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }
  return null;
}

export async function POST(request) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from('quickbooks_connections')
    .delete()
    .eq('detailer_id', user.id);

  if (error) {
    console.error('QB disconnect error:', error);
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return Response.json({ disconnected: true });
}
