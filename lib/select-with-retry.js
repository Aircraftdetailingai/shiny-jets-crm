// Select with "strip the missing column and retry" semantics, shared by
// routes that read soft columns (accepted_at, services, …) that may not
// exist on every deployment.
//
// Several routes had hand-rolled versions whose regexes didn't match
// PostgREST's actual message ("column quotes.accepted_at does not exist"),
// so a single missing column silently turned the whole query into [] —
// which is how Analytics showed "No customer data yet" / 0% accepted and
// the Dashboard showed $0 revenue while quotes existed.

export function missingColumnFromError(error) {
  const msg = error?.message || '';
  const m = msg.match(/column\s+(?:"?\w+"?\.)?"?(\w+)"?\s+does not exist/i)
    || msg.match(/Could not find the '([^']+)' column/i)
    || msg.match(/column "([^"]+)"[^]*does not exist/i);
  return m ? m[1] : null;
}

/**
 * @param {object} supabase
 * @param {string} table
 * @param {string} columns comma-separated select list
 * @param {(q: any) => any} build adds filters / order / limit to the query
 * @returns {Promise<{ data: any[], error: any, columns: string }>}
 */
export async function selectWithRetry(supabase, table, columns, build = (q) => q, { label = table, maxAttempts = 6 } = {}) {
  let cols = columns.split(',').map((c) => c.trim()).filter(Boolean);
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await build(supabase.from(table).select(cols.join(', ')));
    if (!error) return { data: data || [], error: null, columns: cols.join(', ') };
    lastError = error;
    const bad = missingColumnFromError(error);
    if (bad && cols.includes(bad)) {
      console.warn(`[${label}] column "${bad}" missing on ${table}; retrying without it`);
      cols = cols.filter((c) => c !== bad);
      continue;
    }
    console.error(`[${label}] ${table} query error:`, error.message);
    break;
  }
  return { data: [], error: lastError, columns: cols.join(', ') };
}
