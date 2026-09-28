// lib/upsertCustomerAircraft.js
//
// Pins an aircraft to a customer's aircraft list whenever it appears on a
// new invoice, quote, or job. Idempotent — does not overwrite existing rows.
//
// No-op (returns null) when detailer_id, customer_id, or tail_number is
// missing. Model-only aircraft are skipped since "G4" alone is ambiguous —
// the tail number is the unique identifier.
//
// Duplicate prevention: a tail can already have a row for this detailer
// that was created by the portal-side pin (customer_account_id set,
// customer_id null). Instead of inserting a second row (which made the
// fleet list show the same tail twice), that row is adopted by filling in
// customer_id. Category slugs (large_jet, turboprop …) are never written
// into the manufacturer column.

import { isAircraftCategory } from './aircraft-labels.js';

export async function upsertCustomerAircraft(supabase, {
  detailer_id,
  customer_id,
  tail_number,
  model = null,
  manufacturer = null,
  year = null,
}) {
  if (!detailer_id || !customer_id || !tail_number) return null;

  const tail = String(tail_number).trim().toUpperCase();
  if (!tail) return null;
  const cleanManufacturer = manufacturer && !isAircraftCategory(manufacturer) ? manufacturer : null;
  const cleanModel = model && !isAircraftCategory(model) ? model : null;

  const { data: existingRows, error: selectError } = await supabase
    .from('customer_aircraft')
    .select('id, customer_id, detailer_id, manufacturer, model')
    .or(`detailer_id.eq.${detailer_id},customer_id.eq.${customer_id}`)
    .ilike('tail_number', tail);

  if (selectError) {
    console.error('[upsertCustomerAircraft] select failed:', selectError);
    return null;
  }
  const rows = existingRows || [];
  const mine = rows.find((r) => r.customer_id === customer_id);
  if (mine) return { id: mine.id };

  const orphan = rows.find((r) => !r.customer_id && r.detailer_id === detailer_id);
  if (orphan) {
    const patch = { customer_id };
    if (!orphan.model && cleanModel) patch.model = cleanModel;
    if ((!orphan.manufacturer || isAircraftCategory(orphan.manufacturer)) && cleanManufacturer) patch.manufacturer = cleanManufacturer;
    const { error: adoptErr } = await supabase
      .from('customer_aircraft')
      .update(patch)
      .eq('id', orphan.id)
      .is('customer_id', null);
    if (!adoptErr) return { id: orphan.id };
    console.error('[upsertCustomerAircraft] adopt failed, inserting instead:', adoptErr.message);
  }

  const { data, error } = await supabase
    .from('customer_aircraft')
    .insert({
      detailer_id,
      customer_id,
      tail_number: tail,
      model: cleanModel,
      manufacturer: cleanManufacturer,
      year,
    })
    .select('id')
    .maybeSingle();

  // 23505 = unique_violation. Benign race against a parallel insert.
  if (error && error.code !== '23505') {
    console.error('[upsertCustomerAircraft] insert failed:', error);
    return null;
  }
  return data;
}
