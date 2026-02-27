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

export async function GET(request) {
  const user = await getUser(request);
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();

  try {
    const { data: connection } = await supabase
      .from('quickbooks_connections')
      .select('realm_id, token_expires_at, connected_at')
      .eq('detailer_id', user.id)
      .single();

    if (!connection) {
      return Response.json({ connected: false, status: 'NOT_CONNECTED' });
    }

    const isExpired = new Date(connection.token_expires_at) < new Date();

    return Response.json({
      connected: true,
      status: isExpired ? 'TOKEN_EXPIRED' : 'ACTIVE',
      realm_id: connection.realm_id,
      connected_at: connection.connected_at,
    });
  } catch (err) {
    return Response.json({ connected: false, status: 'NOT_CONNECTED' });
  }
}
