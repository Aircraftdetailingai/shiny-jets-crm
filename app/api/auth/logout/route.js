import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('auth_token');
  } catch {
    // Cookie deletion can fail in edge contexts — non-critical
  }
  return Response.json({ success: true });
}
