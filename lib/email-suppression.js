// Canonical email suppression list.
//
// The /unsubscribe flow (app/api/unsubscribe/route.js) inserts every opted-out
// address — detailer OR customer — into the `email_unsubscribes` table as a
// lowercased email. Marketing / lifecycle crons MUST consult this list before
// sending. Transactional mail (quote sent, payment receipts, etc.) must NOT be
// suppressed by it.

// Load all opted-out emails as a lowercased Set. Throws on a DB error so the
// caller can fail closed (send nothing) rather than risk emailing someone who
// opted out.
export async function loadUnsubscribedEmails(supabase) {
  const set = new Set();
  const { data, error } = await supabase.from('email_unsubscribes').select('email');
  if (error) {
    throw new Error(`email_unsubscribes load failed: ${error.message}`);
  }
  for (const row of data || []) {
    if (row.email) set.add(row.email.toLowerCase());
  }
  return set;
}

// True when `email` is present in the suppression set (case-insensitive).
export function isUnsubscribed(set, email) {
  return !!email && set.has(String(email).toLowerCase());
}
