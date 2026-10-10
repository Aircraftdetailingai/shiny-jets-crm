// Turn logged job hours into a shop calibration other aircraft can use.
//
// pct = (actual / this model's catalog baseline - 1) * 100
// Other models then get catalogBaseline * (1 + pct/100) via computeCalibratedHours.
// The aircraft that was actually worked is pinned to the logged hours so the
// pin keeps winning on that model.

import { derivePctFromHours } from './calibration-derive';
import { HOURS_FIELD_TO_HRS_COL } from './calibration-reference';
import { detectHoursField } from './service-defaults';

const FIELD_TO_REF = {
  ext_wash_hours: 'wash',
  decon_hours: 'decon',
  polish_hours: 'polish',
  wax_hours: 'wax',
  ceramic_hours: 'ceramic',
  spray_ceramic_hours: 'spray_ceramic',
  leather_hours: 'leather',
  carpet_hours: 'carpet',
  brightwork_hours: 'brightwork',
};

function matchService(services, sh) {
  const list = Array.isArray(services) ? services : [];
  const name = String(sh?.service_name || sh?.description || '').toLowerCase().trim();
  if (name) {
    const exact = list.find((s) => String(s?.name || '').toLowerCase().trim() === name);
    if (exact) return exact;
  }
  if (sh?.hours_field) {
    const byField = list.find((s) => s?.hours_field === sh.hours_field);
    if (byField) return byField;
  }
  return null;
}

export function learningUpdates({ serviceHours, services, aircraftHoursRow } = {}) {
  const updates = [];
  for (const sh of serviceHours || []) {
    const actual = parseFloat(sh?.actual_hours);
    if (!Number.isFinite(actual) || actual <= 0) continue;

    const svc = matchService(services, sh);
    const field = sh?.hours_field || svc?.hours_field || detectHoursField(sh?.service_name || svc?.name, svc?.category);
    const refType = FIELD_TO_REF[field];
    const column = field ? HOURS_FIELD_TO_HRS_COL[field] : null;
    if (!svc?.id || !refType || !column) continue;

    const baseline = parseFloat(aircraftHoursRow?.[column]);
    const pct = derivePctFromHours(actual, baseline);
    if (pct == null) continue;

    updates.push({
      service_id: svc.id,
      service_name: svc.name,
      reference_service_type: refType,
      adjustment_pct: pct,
      pin_hours: actual,
    });
  }
  return updates;
}

// Writes the calibration (other aircraft) and a pin on the worked aircraft.
// Failures are logged and swallowed so completing a job still succeeds.
export async function applyJobLearning(supabase, { detailerId, aircraftId, make, model, serviceHours, aircraftHoursRow }) {
  if (!supabase || !detailerId) return [];
  let hoursRow = aircraftHoursRow || null;
  if (!hoursRow && make && model) {
    try {
      const { data } = await supabase
        .from('aircraft_hours')
        .select('*')
        .ilike('make', String(make).trim())
        .ilike('model', String(model).trim())
        .limit(1);
      hoursRow = Array.isArray(data) ? data[0] : data;
    } catch (e) {
      console.error('[learn-from-job] aircraft hours lookup failed:', e?.message || e);
    }
  }
  let services = [];
  try {
    const { data } = await supabase
      .from('services')
      .select('id, name, hours_field, category')
      .eq('detailer_id', detailerId);
    services = data || [];
  } catch (e) {
    console.error('[learn-from-job] services lookup failed:', e?.message || e);
    return [];
  }

  const updates = learningUpdates({ serviceHours, services, aircraftHoursRow: hoursRow });
  for (const u of updates) {
    try {
      const { error } = await supabase.from('service_calibrations').upsert({
        detailer_id: detailerId,
        service_id: u.service_id,
        service_name: u.service_name,
        reference_service_type: u.reference_service_type,
        adjustment_pct: u.adjustment_pct,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'detailer_id,service_id' });
      if (error) console.error('[learn-from-job] calibration upsert failed:', error.message);
    } catch (e) {
      console.error('[learn-from-job] calibration upsert threw:', e?.message || e);
    }

    if (!aircraftId) continue;
    try {
      const { data: existing } = await supabase
        .from('detailer_aircraft_overrides')
        .select('id')
        .eq('detailer_id', detailerId)
        .eq('service_name', u.service_name)
        .eq('aircraft_id', aircraftId)
        .is('custom_aircraft_id', null)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from('detailer_aircraft_overrides').update({
          hours: u.pin_hours,
          service_id: u.service_id,
        }).eq('id', existing.id);
      } else {
        await supabase.from('detailer_aircraft_overrides').insert({
          detailer_id: detailerId,
          aircraft_id: aircraftId,
          custom_aircraft_id: null,
          service_id: u.service_id,
          service_name: u.service_name,
          hours: u.pin_hours,
        });
      }
    } catch (e) {
      console.error('[learn-from-job] pin failed:', e?.message || e);
    }
  }
  return updates;
}
