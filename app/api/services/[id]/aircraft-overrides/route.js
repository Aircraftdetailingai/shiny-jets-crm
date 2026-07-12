// Per-aircraft hour overrides for a single service.
//
// GET returns every aircraft from aircraft_hours LEFT-merged with the
// detailer's detailer_aircraft_overrides rows for this service. The client
// (CalibrationModal) renders an editable table over this — the slider+
// reference math drives the "Calibrated" column live, while any populated
// override row locks that aircraft to the exact hours value.
//
// POST batches inserts/updates/deletes in one round-trip — `hours: null` or
// missing means delete.
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const NO_STORE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: NO_STORE });

  const { id: serviceId } = await params;
  const supabase = getSupabase();
  const detailerId = await resolveDetailerId(supabase, user);

  // Pull the detailer's service to confirm it exists + ownership, and to get
  // the canonical service_name (overrides legacy-key on service_name too).
  const { data: svc, error: svcErr } = await supabase
    .from('services')
    .select('id, name, detailer_id')
    .eq('id', serviceId)
    .eq('detailer_id', detailerId)
    .maybeSingle();
  if (svcErr || !svc) {
    return new Response(JSON.stringify({ error: svcErr?.message || 'Service not found' }), { status: 404, headers: NO_STORE });
  }

  // Load every aircraft in the platform catalog. Selecting * keeps the
  // *_hrs columns flexible — the client maps reference_type → column with
  // the same dialect the calibration math uses (lib/calibrate-hours.js).
  const { data: aircraft, error: acErr } = await supabase
    .from('aircraft_hours')
    .select('*')
    .order('make', { ascending: true })
    .order('model', { ascending: true });
  if (acErr) {
    return new Response(JSON.stringify({ error: acErr.message }), { status: 500, headers: NO_STORE });
  }

  // Load the detailer's overrides for this service. The table keys on
  // (detailer_id, aircraft_id, service_id) ideally, but legacy rows from
  // Brett's SQL import key on service_name only (service_id null) — match
  // either. Two narrow queries are simpler than wrestling PostgREST .or()
  // escaping for service names that may contain commas or parens.
  const [{ data: byId, error: ovErrId }, { data: byName, error: ovErrName }] = await Promise.all([
    supabase
      .from('detailer_aircraft_overrides')
      .select('id, aircraft_id, service_id, service_name, hours')
      .eq('detailer_id', detailerId)
      .eq('service_id', serviceId),
    supabase
      .from('detailer_aircraft_overrides')
      .select('id, aircraft_id, service_id, service_name, hours')
      .eq('detailer_id', detailerId)
      .is('service_id', null)
      .eq('service_name', svc.name),
  ]);
  if (ovErrId || ovErrName) {
    console.error('[overrides GET] override fetch failed:', ovErrId?.message, ovErrName?.message);
  }
  // Merge — same aircraft showing in both lists prefers the service_id row.
  const overrides = [...(byName || []), ...(byId || [])];

  // Index overrides by aircraft_id for O(1) merge.
  const byAircraft = {};
  for (const o of (overrides || [])) {
    if (o.aircraft_id) byAircraft[o.aircraft_id] = o;
  }

  // Merge.
  const rows = (aircraft || []).map((a) => ({
    aircraft_id: a.id,
    make: a.make || null,
    model: a.model || null,
    category: a.category || null,
    // Pass every *_hrs column through so the client can pick whichever
    // reference_type is currently selected (and re-pick without refetching).
    hours: {
      maintenance_wash: a.maintenance_wash_hrs ?? null,
      one_step_polish: a.one_step_polish_hrs ?? null,
      wax: a.wax_hrs ?? null,
      ceramic_coating: a.ceramic_coating_hrs ?? null,
      spray_ceramic: a.spray_ceramic_hrs ?? null,
      decon_paint: a.decon_paint_hrs ?? null,
      carpet: a.carpet_hrs ?? null,
      leather: a.leather_hrs ?? null,
      brightwork: a.brightwork_hrs ?? null,
    },
    override: byAircraft[a.id]
      ? { id: byAircraft[a.id].id, hours: byAircraft[a.id].hours }
      : null,
  }));

  return new Response(
    JSON.stringify({
      service: { id: svc.id, name: svc.name },
      aircraft: rows,
      override_count: Object.keys(byAircraft).length,
    }),
    { status: 200, headers: NO_STORE },
  );
}

// Batch upsert / delete. Body: { changes: [{ aircraft_id, hours }] }
// hours null/empty/undefined → DELETE that override row.
export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: NO_STORE });

  const { id: serviceId } = await params;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (changes.length === 0) {
    return new Response(JSON.stringify({ ok: true, upserted: 0, deleted: 0 }), { status: 200, headers: NO_STORE });
  }

  const supabase = getSupabase();
  const detailerId = await resolveDetailerId(supabase, user);

  // Confirm ownership of the service before touching overrides.
  const { data: svc } = await supabase
    .from('services')
    .select('id, name')
    .eq('id', serviceId)
    .eq('detailer_id', detailerId)
    .maybeSingle();
  if (!svc) {
    return new Response(JSON.stringify({ error: 'Service not found' }), { status: 404, headers: NO_STORE });
  }

  // Partition changes.
  const toDelete = [];
  const toUpsert = [];
  for (const c of changes) {
    if (!c?.aircraft_id) continue;
    const h = c.hours;
    if (h === null || h === undefined || h === '' || (typeof h === 'number' && Number.isNaN(h))) {
      toDelete.push(c.aircraft_id);
    } else {
      const num = parseFloat(h);
      if (Number.isFinite(num) && num >= 0) {
        toUpsert.push({
          detailer_id: detailerId,
          aircraft_id: c.aircraft_id,
          service_id: serviceId,
          service_name: svc.name,
          hours: num,
        });
      }
    }
  }

  let deleted = 0;
  let upserted = 0;
  const errors = [];

  // DELETE: every override row matching detailer_id + service (id OR name)
  // + aircraft_id in toDelete. Two narrow deletes — service_id match AND
  // legacy service_name-only match — sidestep PostgREST .or() escaping for
  // names that might contain commas.
  if (toDelete.length > 0) {
    const [{ error: delErrId, count: c1 }, { error: delErrName, count: c2 }] = await Promise.all([
      supabase
        .from('detailer_aircraft_overrides')
        .delete({ count: 'exact' })
        .eq('detailer_id', detailerId)
        .eq('service_id', serviceId)
        .in('aircraft_id', toDelete),
      supabase
        .from('detailer_aircraft_overrides')
        .delete({ count: 'exact' })
        .eq('detailer_id', detailerId)
        .is('service_id', null)
        .eq('service_name', svc.name)
        .in('aircraft_id', toDelete),
    ]);
    if (delErrId) {
      console.error('[overrides POST] delete (by id) failed:', delErrId.message);
      errors.push({ step: 'delete_by_id', error: delErrId.message });
    }
    if (delErrName) {
      console.error('[overrides POST] delete (by name) failed:', delErrName.message);
      errors.push({ step: 'delete_by_name', error: delErrName.message });
    }
    deleted = (c1 || 0) + (c2 || 0);
  }

  // UPSERT: look up existing rows by (detailer, aircraft, service_id), then
  // by (detailer, aircraft, service_name) for legacy rows. Update in place
  // if found; otherwise insert. Done one row at a time because the unique
  // index shape varies between fresh rows and legacy SQL-imported rows. For
  // Brett's case (3,771 rows already exist) every upsert will resolve to
  // the update branch.
  for (const row of toUpsert) {
    let existingId = null;
    const byId = await supabase
      .from('detailer_aircraft_overrides')
      .select('id')
      .eq('detailer_id', detailerId)
      .eq('aircraft_id', row.aircraft_id)
      .eq('service_id', serviceId)
      .limit(1)
      .maybeSingle();
    if (byId.data?.id) {
      existingId = byId.data.id;
    } else {
      const byName = await supabase
        .from('detailer_aircraft_overrides')
        .select('id')
        .eq('detailer_id', detailerId)
        .eq('aircraft_id', row.aircraft_id)
        .is('service_id', null)
        .eq('service_name', svc.name)
        .limit(1)
        .maybeSingle();
      if (byName.data?.id) existingId = byName.data.id;
    }
    if (existingId) {
      const { error: updErr } = await supabase
        .from('detailer_aircraft_overrides')
        .update({ hours: row.hours, service_id: serviceId, service_name: svc.name })
        .eq('id', existingId);
      if (updErr) errors.push({ step: 'update', aircraft_id: row.aircraft_id, error: updErr.message });
      else upserted++;
    } else {
      const { error: insErr } = await supabase
        .from('detailer_aircraft_overrides')
        .insert(row);
      if (insErr) errors.push({ step: 'insert', aircraft_id: row.aircraft_id, error: insErr.message });
      else upserted++;
    }
  }

  return new Response(
    JSON.stringify({ ok: errors.length === 0, upserted, deleted, errors: errors.length ? errors : undefined }),
    { status: errors.length ? 207 : 200, headers: NO_STORE },
  );
}
