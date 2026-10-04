import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';
import { getServiceSupabase } from '@/lib/ask-brett-server';
import { TERMS_VERSION } from '@/lib/detailing-ai-terms';
import { getTermsStatus, recordTermsAcceptance } from '@/lib/detailing-ai-terms-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function ctx(request) {
  const user = await getAuthUser(request);
  if (!user) return { res: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'crew') return { res: Response.json({ error: 'Owner/staff access required' }, { status: 403 }) };
  const planGate = await requireFeature(request, 'detailingAi', { user });
  if (planGate) return { res: planGate };
  return { user, supabase: getServiceSupabase() };
}

// GET: has this user accepted the current Aircraft Detailing AI Terms version?
export async function GET(request) {
  const c = await ctx(request);
  if (c.res) return c.res;
  const s = await getTermsStatus(c.supabase, c.user);
  if (!s.ok) return Response.json({ terms_version: TERMS_VERSION, accepted: false, unavailable: true }, { status: 503 });
  return Response.json({ terms_version: TERMS_VERSION, accepted: s.accepted, accepted_at: s.accepted_at });
}

// POST { terms_version }: "I agree". Only the current version can be accepted.
export async function POST(request) {
  const c = await ctx(request);
  if (c.res) return c.res;
  const body = await request.json().catch(() => ({}));
  if (body.terms_version !== TERMS_VERSION) {
    return Response.json({ error: 'The terms were updated. Reload the page to see the current version.', terms_version: TERMS_VERSION }, { status: 409 });
  }
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || null;
  const s = await recordTermsAcceptance(c.supabase, c.user, { userAgent: request.headers.get('user-agent'), ip });
  if (!s.ok || !s.accepted) {
    return Response.json({ error: 'We couldn\u2019t save your agreement. Check your connection and try again.' }, { status: 503 });
  }
  return Response.json({ terms_version: TERMS_VERSION, accepted: true, accepted_at: s.accepted_at });
}
