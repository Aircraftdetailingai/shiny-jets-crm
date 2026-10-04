// Google sign-in identity. Supabase Auth is only the OAuth proof; the CRM
// session is still the app JWT from lib/auth.js createToken. Callers must
// pass a Supabase access token and use only what auth.getUser returns.

/** Access token from `Authorization: Bearer <token>`, or '' when absent. */
export function readBearerToken(authorizationHeader) {
  const header = String(authorizationHeader || '');
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

/**
 * Email and oauth id taken only from a user object returned by
 * supabase.auth.getUser. Body email / oauth_id are not inputs.
 * Returns null when the verified user has no email or id.
 */
export function identityFromSupabaseUser(user) {
  const email = String(user?.email || '').trim().toLowerCase();
  const oauth_id = user?.id == null ? '' : String(user.id).trim();
  if (!email || !oauth_id) return null;
  return { email, oauth_id };
}
