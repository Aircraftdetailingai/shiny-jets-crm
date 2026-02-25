import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

// GET - Validate a referral code and return referrer info
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return Response.json({ error: 'Code required' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: referrer, error } = await supabase
    .from('detailers')
    .select('id, name, company')
    .eq('referral_code', code.toUpperCase())
    .single();

  if (error || !referrer) {
    return Response.json({ error: 'Invalid referral code' }, { status: 404 });
  }

  return Response.json({
    referrer: {
      name: referrer.name,
      company: referrer.company,
    },
  });
}
