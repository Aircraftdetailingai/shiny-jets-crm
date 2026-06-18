// Centralized signed URL generation for the private "sop-documents"
// bucket. Read surfaces use the short default (1 hour); the briefing
// email uses BRIEFING_EXPIRY_SECONDS (7 days, Supabase max) so the
// emailed link opens with no login — option B per Brett's spec.
//
// Never expose public URLs from this bucket. Always go through this
// helper so the bucket name + expiry policy stay in one place.

const BUCKET = 'sop-documents';
const READ_EXPIRY_SECONDS = 3600; // 1 hour — matches the documents route precedent
export const BRIEFING_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function signSopUrl(supabase, path, { expiresIn = READ_EXPIRY_SECONDS } = {}) {
  if (!supabase || !path) return null;
  try {
    const { data, error } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error) {
      console.warn('[sop-signed-url] createSignedUrl failed (non-fatal):', error.message, 'path:', path);
      return null;
    }
    return data?.signedUrl || null;
  } catch (err) {
    console.warn('[sop-signed-url] exception:', err?.message || err);
    return null;
  }
}

// Batch helper — sign many paths in parallel for the catalog/overrides
// GET responses. Returns a Map(path -> signedUrl) so callers can do
// O(1) lookup while merging onto the response rows.
export async function signSopUrls(supabase, paths, opts) {
  const unique = Array.from(new Set((paths || []).filter(Boolean)));
  if (unique.length === 0) return new Map();
  const results = await Promise.all(unique.map((p) => signSopUrl(supabase, p, opts).then((u) => [p, u])));
  return new Map(results);
}
