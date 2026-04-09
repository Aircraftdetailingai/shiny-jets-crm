import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

function getTier(detailer) {
  const certs = detailer.certifications || [];
  if (detailer.plan === 'enterprise') return 'enterprise';
  if (certs.includes('Shiny Jets 5-Day Private Course')) return 'private_course';
  if (certs.includes('Shiny Jets 5-Day Group Class')) return 'group_course';
  if (certs.includes('Shiny Jets Online Course')) return 'online';
  if (certs.includes('Real Clean')) return 'real_clean';
  return 'member';
}

const TIER_ORDER = { enterprise: 0, private_course: 1, group_course: 2, online: 3, real_clean: 4, member: 5 };

export async function GET() {
  const supabase = getSupabase();

  const { data: detailers, error } = await supabase
    .from('detailers')
    .select('id, name, company, slug, logo_url, plan, airports_served, certifications, insurance_verified, verified_finish, listed_in_directory, has_online_booking, directory_description')
    .eq('listed_in_directory', true)
    .eq('status', 'active');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Get services for each listed detailer
  const ids = (detailers || []).map(d => d.id);
  let serviceMap = {};
  if (ids.length > 0) {
    const { data: services } = await supabase
      .from('services')
      .select('detailer_id, name')
      .in('detailer_id', ids);
    for (const s of (services || [])) {
      if (!serviceMap[s.detailer_id]) serviceMap[s.detailer_id] = [];
      serviceMap[s.detailer_id].push(s.name);
    }
  }

  const listings = (detailers || []).map(d => ({
    id: d.id,
    name: d.company || d.name,
    slug: d.slug,
    logo_url: d.logo_url,
    plan: d.plan,
    tier: getTier(d),
    airports_served: d.airports_served || [],
    services: serviceMap[d.id] || [],
    certifications: d.certifications || [],
    insurance_verified: d.insurance_verified || false,
    verified_finish: d.verified_finish || false,
    has_online_booking: d.has_online_booking || false,
    description: d.directory_description || '',
  }));

  // Sort by tier priority
  listings.sort((a, b) => (TIER_ORDER[a.tier] || 5) - (TIER_ORDER[b.tier] || 5));

  return Response.json({ detailers: listings }, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
