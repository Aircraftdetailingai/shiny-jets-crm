import { createClient } from '@supabase/supabase-js';
import { getPortalUser } from '@/lib/portal-customer-auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// POST — generate or regenerate share token
export async function POST(request, { params }) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { tail } = await params;
  const tailNumber = decodeURIComponent(tail).toUpperCase();
  const supabase = getSupabase();

  const token = crypto.randomUUID();

  // Try to update share_token on customer_aircraft
  let updates = { share_token: token };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from('customer_aircraft')
      .update(updates)
      .eq('customer_account_id', user.customer_id)
      .eq('tail_number', tailNumber)
      .select('id, share_token')
      .single();

    if (!error) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://crm.shinyjets.com';
      return Response.json({ share_url: `${baseUrl}/portal/aircraft/${encodeURIComponent(tailNumber)}/share/${token}`, token });
    }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) { delete updates[colMatch[1]]; continue; }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ error: 'Failed to create share link' }, { status: 500 });
}

// GET — get current share link
export async function GET(request, { params }) {
  const user = await getPortalUser(request);
  if (!user?.customer_id) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { tail } = await params;
  const tailNumber = decodeURIComponent(tail).toUpperCase();
  const supabase = getSupabase();

  const { data } = await supabase.from('customer_aircraft')
    .select('share_token')
    .eq('customer_account_id', user.customer_id)
    .eq('tail_number', tailNumber)
    .maybeSingle();

  if (!data?.share_token) return Response.json({ share_url: null });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://crm.shinyjets.com';
  return Response.json({ share_url: `${baseUrl}/portal/aircraft/${encodeURIComponent(tailNumber)}/share/${data.share_token}` });
}
