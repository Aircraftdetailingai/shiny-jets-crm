import { createClient } from '@supabase/supabase-js';
import { US_AIRPORTS } from '@/lib/airports';

const BASE_URL = 'https://app.vectorav.ai';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export default async function sitemap() {
  const now = new Date().toISOString();

  // Static pages
  const staticPages = [
    { url: `${BASE_URL}`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/landing`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/find-a-detailer`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Airport pages
  const airportPages = US_AIRPORTS.map(a => ({
    url: `${BASE_URL}/airport/${a.icao}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Detailer profile pages from Supabase
  let detailerPages = [];
  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase
        .from('detailers')
        .select('id')
        .eq('listed_in_directory', true)
        .eq('status', 'active')
        .in('plan', ['pro', 'business', 'enterprise']);

      if (data) {
        detailerPages = data.map(d => ({
          url: `${BASE_URL}/detailer/${d.id}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.6,
        }));
      }
    }
  } catch (e) {
    console.error('Sitemap: Failed to fetch detailers:', e.message);
  }

  return [...staticPages, ...airportPages, ...detailerPages];
}
