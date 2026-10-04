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

/** Display name from the Auth user record. Never from the request body. */
export function nameFromSupabaseUser(user) {
  const meta = user?.user_metadata || {};
  const full = meta.full_name || meta.name;
  if (typeof full === 'string' && full.trim()) return full.trim();
  const given = typeof meta.given_name === 'string' ? meta.given_name.trim() : '';
  const family = typeof meta.family_name === 'string' ? meta.family_name.trim() : '';
  return [given, family].filter(Boolean).join(' ');
}

// Providers the login buttons can start. An email/password Supabase user is
// not one of these: that session must not be exchanged for a CRM JWT.
const OAUTH_PROVIDERS = new Set(['google', 'facebook', 'apple']);

function providerCandidates(user) {
  const candidates = [];
  const meta = user?.app_metadata || {};
  if (typeof meta.provider === 'string') candidates.push(meta.provider);
  if (Array.isArray(meta.providers)) candidates.push(...meta.providers);
  if (Array.isArray(user?.identities)) {
    for (const identity of user.identities) {
      if (identity?.provider) candidates.push(identity.provider);
    }
  }
  return candidates
    .map((candidate) => String(candidate || '').trim().toLowerCase())
    .filter(Boolean);
}

/** First real OAuth provider on the Auth user, or '' when there isn't one. */
export function oauthProviderFromSupabaseUser(user) {
  return providerCandidates(user).find((provider) => OAUTH_PROVIDERS.has(provider)) || '';
}

export function hasVerifiedOAuthProvider(user) {
  return oauthProviderFromSupabaseUser(user) !== '';
}

/**
 * Provider id from the Auth user. OAuth wins over an email identity so a
 * linked Google login is recorded as Google. Never reads the request body.
 * Returns '' when the user has no provider at all.
 */
export function providerFromSupabaseUser(user) {
  const oauth = oauthProviderFromSupabaseUser(user);
  if (oauth) return oauth;
  return providerCandidates(user)[0] || '';
}
