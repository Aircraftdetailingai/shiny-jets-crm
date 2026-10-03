// Authenticated: AI Leads (website chat handoffs) for the signed-in account.
//   GET            -> { leads: [...] }  (intake_leads where source = 'ai_chat')
//   GET ?id=<uuid> -> { lead }
//   PATCH { id, status: 'new'|'contacted'|'converted' }
// Every query is filtered by detailer_id = the caller's account.
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { getServiceSupabase } from '@/lib/ai-chat-server';
import { toAiLead, aiStatusToDb } from '@/lib/ai-chat';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
const NO_STORE = { 'Cache-Control': 'no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ctx(request) {
  const user = await getAuthUser(request);
  if (!user) return { res: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (user.role === 'crew') return { res: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  const supabase = getServiceSupabase();
  if (!supabase) return { res: Response.json({ error: 'Database not configured' }, { status: 500 }) };
  const detailerId = await resolveDetailerId(supabase, user);
  return { supabase, detailerId };
}

export async function GET(request) {
  const { res, supabase, detailerId } = await ctx(request);
  if (res) return res;
  const id = new URL(request.url).searchParams.get('id');
  let q = supabase.from('intake_leads')
    .select('id, created_at, name, phone, notes, status, source, sms_opted_in, intake_responses')
    .eq('detailer_id', detailerId).eq('source', 'ai_chat')
    .order('created_at', { ascending: false }).limit(1000);
  if (id) {
    if (!UUID_RE.test(id)) return Response.json({ error: 'Not found' }, { status: 404 });
    q = q.eq('id', id);
  }
  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01') return Response.json({ leads: [] }, { headers: NO_STORE });
    console.error('[ai-leads] list failed:', error.message);
    return Response.json({ error: 'Could not load AI leads.' }, { status: 500 });
  }
  const leads = (data || []).map(toAiLead);
  if (id) return leads[0] ? Response.json({ lead: leads[0] }, { headers: NO_STORE }) : Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ leads }, { headers: NO_STORE });
}

export async function PATCH(request) {
  const { res, supabase, detailerId } = await ctx(request);
  if (res) return res;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const status = aiStatusToDb(body?.status);
  if (!status || !UUID_RE.test(String(body?.id || ''))) return Response.json({ error: 'Bad request' }, { status: 400 });
  const { data, error } = await supabase.from('intake_leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', body.id).eq('detailer_id', detailerId).eq('source', 'ai_chat')
    .select('id, created_at, name, phone, notes, status, source, sms_opted_in, intake_responses').maybeSingle();
  if (error) { console.error('[ai-leads] update failed:', error.message); return Response.json({ error: 'Could not update.' }, { status: 500 }); }
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ lead: toAiLead(data) });
}
