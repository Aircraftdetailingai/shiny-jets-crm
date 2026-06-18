// (detailer_id, tail_number) -> customer_aircraft.id resolver.
//
// Built for the SOP resolver but kept independent so the deferred
// projected-products work can reuse it. Module-level cache would leak
// across server requests, so the caller passes an optional Map for
// per-render caching when resolving multiple tails or hitting the same
// tail multiple times.
//
// Canonicalization: trim + uppercase. Matches the convention used in
// app/api/jobs/[id]/send-briefing/route.js and the brief-email flow.
// Returns null when no customer_aircraft row exists for this (detailer,
// tail) pair — callers should treat null as "no aircraft-specific data"
// rather than as an error.

export function canonicalTail(tail) {
  if (!tail) return null;
  return String(tail).trim().toUpperCase();
}

export async function resolveAircraftIdByTail(
  supabase,
  { detailer_id, tail_number },
  cache,
) {
  if (!supabase || !detailer_id || !tail_number) return null;

  const tail = canonicalTail(tail_number);
  if (!tail) return null;

  const cacheKey = `${detailer_id}::${tail}`;
  if (cache && cache.has(cacheKey)) return cache.get(cacheKey);

  const { data, error } = await supabase
    .from('customer_aircraft')
    .select('id')
    .eq('detailer_id', detailer_id)
    .ilike('tail_number', tail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[resolve-aircraft] lookup error (non-fatal):', error.message);
    if (cache) cache.set(cacheKey, null);
    return null;
  }

  const aircraftId = data?.id || null;
  if (cache) cache.set(cacheKey, aircraftId);
  return aircraftId;
}

// Find-or-create variant — used by the L2 override POST endpoint so the
// owner can pin an aircraft-specific SOP even when no customer_aircraft
// row exists yet for that tail. Returns { aircraft_id, created } so the
// caller can surface "tracked this aircraft for the first time" in UI
// copy if desired. Manufacturer/model are best-effort metadata grabbed
// from the most recent quote referencing this tail.
export async function findOrCreateAircraftByTail(
  supabase,
  { detailer_id, tail_number },
) {
  const existing = await resolveAircraftIdByTail(supabase, { detailer_id, tail_number });
  if (existing) return { aircraft_id: existing, created: false };

  const tail = canonicalTail(tail_number);
  if (!tail) return { aircraft_id: null, created: false };

  // Pull the most recent quote for this tail to seed manufacturer/model
  // metadata on the new customer_aircraft row. Non-fatal if nothing comes
  // back — the row is still useful just to anchor the SOP overrides.
  const { data: recentQuote } = await supabase
    .from('quotes')
    .select('aircraft_model, aircraft_type, client_name')
    .eq('detailer_id', detailer_id)
    .eq('tail_number', tail)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let row = {
    detailer_id,
    tail_number: tail,
    manufacturer: recentQuote?.aircraft_type || null,
    model: recentQuote?.aircraft_model || null,
  };

  // Column-stripping retry — matches the codebase pattern. Some deploys
  // may not have manufacturer/model on customer_aircraft yet.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from('customer_aircraft')
      .insert(row)
      .select('id')
      .single();
    if (!error) return { aircraft_id: data.id, created: true };

    const colMatch =
      error.message?.match(/column "([^"]+)" of relation "customer_aircraft" does not exist/) ||
      error.message?.match(/Could not find the '([^']+)' column of 'customer_aircraft'/);
    if (colMatch && row[colMatch[1]] !== undefined) {
      delete row[colMatch[1]];
      continue;
    }
    console.error('[resolve-aircraft] auto-create failed:', error.message);
    return { aircraft_id: null, created: false };
  }
  return { aircraft_id: null, created: false };
}
