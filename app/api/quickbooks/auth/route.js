import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';
import { getAuthorizationUrl } from '@/lib/quickbooks';

export const dynamic = 'force-dynamic';

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
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.QUICKBOOKS_CLIENT_ID || !process.env.QUICKBOOKS_CLIENT_SECRET) {
      return Response.json({ error: 'QuickBooks not configured' }, { status: 500 });
    }

    const url = getAuthorizationUrl(user.id);
    return Response.json({ url });
  } catch (err) {
    console.error('QuickBooks auth error:', err);
    return Response.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
