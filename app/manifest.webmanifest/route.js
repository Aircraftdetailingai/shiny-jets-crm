import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SHINY_JETS_DEFAULT = {
  name: 'Shiny Jets CRM',
  short_name: 'SJ CRM',
  description: 'Professional aircraft detailing business software',
  theme_color: '#007CB1',
  background_color: '#0D1B2A',
  display: 'standalone',
  orientation: 'portrait-primary',
  scope: '/',
  start_url: '/dashboard',
  icons: [
    { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};

const HEADERS = {
  'Content-Type': 'application/manifest+json',
  // Short per-user cache so a logo upload propagates within a minute.
  'Cache-Control': 'private, max-age=60',
};

function getSupabase() {
  if (!process.env.SUPABASE_URL) return null;
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

export async function GET(request) {
  const url = new URL(request.url);
  const detailerId = url.searchParams.get('d');

  // No detailer hint → return Shiny Jets default (used for logged-out hits
  // and for any detailer below the enterprise tier).
  if (!detailerId) {
    return new Response(JSON.stringify(SHINY_JETS_DEFAULT), { status: 200, headers: HEADERS });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return new Response(JSON.stringify(SHINY_JETS_DEFAULT), { status: 200, headers: HEADERS });
  }

  const { data: detailer } = await supabase
    .from('detailers')
    .select('plan, logo_url, logo_dark_url, logo_light_url, company, name')
    .eq('id', detailerId)
    .maybeSingle();

  // White-label rule: business + enterprise plans get their own homescreen
  // icon when a logo is set. Free + Pro → Shiny Jets default. Business or
  // enterprise with no logo uploaded → fall back to Shiny Jets default
  // (don't ship a broken icon).
  const logo = detailer?.logo_url || detailer?.logo_dark_url || detailer?.logo_light_url;
  const plan = detailer?.plan;
  if ((plan === 'business' || plan === 'enterprise') && logo) {
    const fullName = detailer.company || detailer.name || 'CRM';
    return new Response(JSON.stringify({
      ...SHINY_JETS_DEFAULT,
      name: fullName,
      short_name: fullName.slice(0, 12),
      description: fullName,
      icons: [
        { src: logo, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: logo, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    }), { status: 200, headers: HEADERS });
  }

  return new Response(JSON.stringify(SHINY_JETS_DEFAULT), { status: 200, headers: HEADERS });
}
