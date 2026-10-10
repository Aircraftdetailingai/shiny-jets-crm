import { createClient } from '@supabase/supabase-js';
import { PLATFORM_TERMS_MARKDOWN, PLATFORM_TERMS_VERSION } from '@/lib/customer-service-terms';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Bypass Next's Data Cache on supabase-js's internal fetch (d7b2d9e / 54b0b2e)
// so when ops bumps the active platform terms version, customers see the new
// row on their next page load instead of a cached older row.
function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (u, opts) => fetch(u, { ...opts, cache: 'no-store' }) },
  });
}

// GET — returns the currently-active platform legal terms row. Public (the
// customer-facing share-link pages render this above the detailer's own
// terms before payment, and the detailer Settings page renders it read-only
// so detailers see what's being shown above their terms).
export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

  // Explicit allowlist — never select internal-only columns. There aren't
  // any in this table today, but we keep the pattern for future-proofing.
  const { data, error } = await supabase
    .from('platform_legal_versions')
    .select('id, version, body_md, effective_at')
    .eq('is_active', true)
    .order('effective_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[platform-terms/active] fetch error:', error.message);
    return Response.json({ error: 'Failed to fetch platform terms' }, { status: 500 });
  }
  if (!data) {
    // No published row yet. Show the code default so customers still see the
    // same wording as /legal/quote-terms. id is null until a migration (or
    // an admin) stores a version the acceptance stamp can point at.
    return Response.json({
      terms: {
        id: null,
        version: PLATFORM_TERMS_VERSION,
        body_md: PLATFORM_TERMS_MARKDOWN,
        effective_at: null,
        source: 'default',
      },
    });
  }
  return Response.json({ terms: data });
}
