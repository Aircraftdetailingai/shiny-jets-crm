import { getAuthUser } from '@/lib/auth';
import { getAuthorizationUrl } from '@/lib/quickbooks';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
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
