// Customer-account password gate. A session is issued only after the
// submitted password matches the stored hash. Email alone is not a login.

export function customerLoginDecision({ account, password, passwordMatches }) {
  if (!password || !account || !account.password_hash || !passwordMatches) {
    return { ok: false, status: 401, error: 'Invalid email or password' };
  }
  return { ok: true };
}

/** Create requires a password. An email by itself must not open a session. */
export function customerCreatePasswordError(password) {
  if (!password || String(password).length < 8) return 'Password must be at least 8 characters';
  return null;
}
