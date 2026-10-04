// detailers.email is not unique. `.eq('email', lower).single()` errors when
// two rows share an address (PostgREST PGRST116), so login rejects every
// password and forgot-password reports success without sending mail.
// Callers fetch at most 2 rows, case-insensitively, then use these helpers.

/** PostgREST ilike pattern that matches one email exactly (LIKE wildcards escaped). */
export function exactEmailIlike(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * Case-insensitive detailer email lookup: up to 2 rows, newest updated_at first.
 * `query` is a Supabase filter builder (the result of `.from().select()`).
 */
export function detailerEmailQuery(query, email) {
  return query
    .ilike('email', exactEmailIlike(email))
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(2);
}

export function detailerUpdatedMs(row) {
  const t = Date.parse(row?.updated_at || '');
  return Number.isFinite(t) ? t : 0;
}

/** Newest updated_at first. Rows with no timestamp sort last; ties keep order. */
export function orderDetailersByUpdated(rows) {
  return [...(Array.isArray(rows) ? rows : []).filter(Boolean)].sort((a, b) => {
    const delta = detailerUpdatedMs(b) - detailerUpdatedMs(a);
    if (delta) return delta;
    return 0;
  });
}

export function hasDuplicateDetailers(rows) {
  return (Array.isArray(rows) ? rows : []).filter(Boolean).length > 1;
}

/** Log the required line when more than one detailer row shares an email. */
export function noteDuplicateDetailers(rows, email) {
  if (!hasDuplicateDetailers(rows)) return false;
  console.error('[auth] duplicate detailers for', email);
  return true;
}

/**
 * Which row to use when we are not matching a submitted password
 * (forgot-password, or the Supabase Auth fallback after every bcrypt miss).
 * A single row is returned as-is. Duplicates prefer the most recently
 * updated row that has a password_hash.
 */
export function preferredDetailer(rows) {
  const ordered = orderDetailersByUpdated(rows);
  if (!ordered.length) return null;
  if (ordered.length === 1) return ordered[0];
  return ordered.find((row) => row.password_hash) || ordered[0];
}

/** preferredDetailer, plus the duplicate log. */
export function resolveAuthDetailer(rows, email) {
  noteDuplicateDetailers(rows, email);
  return preferredDetailer(rows);
}

/**
 * Login: try each candidate's password_hash (newest first) so a duplicate
 * row cannot hide a valid password on the other row.
 * `compare` is lib/auth comparePassword, injected so tests don't need bcrypt.
 */
export async function matchDetailerPassword(rows, password, compare) {
  const ordered = orderDetailersByUpdated(rows);
  for (const candidate of ordered) {
    if (!candidate.password_hash) continue;
    try {
      if (await compare(password, candidate.password_hash)) return candidate;
    } catch {
      // Unreadable hash — try the next candidate, same as the old single-row catch.
    }
  }
  return null;
}
