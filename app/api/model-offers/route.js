import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { resolveDetailerId } from '@/lib/resolve-detailer';
import { indexOverrides } from '@/lib/applicability';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } });
}

function numOrNull(value) {
  if (value == null || value === '') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// GET — this shop's pins, toggles, and chemical usage for one model.
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const detailerId = await resolveDetailerId(supabase, user);
  const { searchParams } = new URL(request.url);
  const aircraftId = searchParams.get('aircraft_id');
  const customId = searchParams.get('custom_aircraft_id');
  if (!aircraftId && !customId) {
    return Response.json({ error: 'aircraft_id or custom_aircraft_id is required' }, { status: 400 });
  }

  let overridesQuery = supabase.from('model_offer_overrides').select('*').eq('detailer_id', detailerId);
  let usageQuery = supabase.from('model_service_usage').select('*').eq('detailer_id', detailerId);
  if (customId) {
    overridesQuery = overridesQuery.eq('custom_aircraft_id', customId);
    usageQuery = usageQuery.eq('custom_aircraft_id', customId);
  } else {
    overridesQuery = overridesQuery.eq('aircraft_id', aircraftId);
    usageQuery = usageQuery.eq('aircraft_id', aircraftId);
  }
  const [{ data: overrides, error: ovErr }, { data: usage, error: useErr }] = await Promise.all([
    overridesQuery,
    usageQuery,
  ]);
  if (ovErr || useErr) {
    const message = ovErr?.message || useErr?.message || 'Failed to load model offers';
    if (/relation|column/i.test(message)) {
      return Response.json({ overrides: [], usage: [], indexed: indexOverrides([]), pending_migration: true });
    }
    return Response.json({ error: message }, { status: 500 });
  }
  return Response.json({
    overrides: overrides || [],
    usage: usage || [],
    indexed: indexOverrides(overrides),
  });
}

// PUT — save a pin, a price, or an on/off toggle for one service or package.
export async function PUT(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });
  const detailerId = await resolveDetailerId(supabase, user);
  const body = await request.json();
  const aircraftId = body.aircraft_id || null;
  const customId = body.custom_aircraft_id || null;
  const serviceId = body.service_id || null;
  const packageId = body.package_id || null;
  if ((!aircraftId && !customId) || (!serviceId && !packageId) || (serviceId && packageId)) {
    return Response.json({ error: 'Provide one model id and either service_id or package_id' }, { status: 400 });
  }

  let existingQuery = supabase.from('model_offer_overrides').select('id').eq('detailer_id', detailerId);
  existingQuery = customId
    ? existingQuery.eq('custom_aircraft_id', customId)
    : existingQuery.eq('aircraft_id', aircraftId);
  existingQuery = serviceId
    ? existingQuery.eq('service_id', serviceId)
    : existingQuery.eq('package_id', packageId);
  const { data: existing, error: findErr } = await existingQuery.maybeSingle();
  if (findErr && !/relation|column/i.test(findErr.message || '')) {
    return Response.json({ error: findErr.message }, { status: 500 });
  }

  const patch = {
    detailer_id: detailerId,
    aircraft_id: customId ? null : aircraftId,
    custom_aircraft_id: customId,
    make: body.make || null,
    model: body.model || null,
    service_id: serviceId,
    package_id: packageId,
    updated_at: new Date().toISOString(),
  };
  if (body.enabled !== undefined) patch.enabled = body.enabled === null ? null : !!body.enabled;
  if (body.pinned_hours !== undefined) patch.pinned_hours = numOrNull(body.pinned_hours);
  if (body.pinned_price !== undefined) patch.pinned_price = numOrNull(body.pinned_price);

  let saved;
  let error;
  if (existing?.id) {
    const result = await supabase.from('model_offer_overrides').update(patch).eq('id', existing.id).eq('detailer_id', detailerId).select().single();
    saved = result.data;
    error = result.error;
  } else {
    const result = await supabase.from('model_offer_overrides').insert(patch).select().single();
    saved = result.data;
    error = result.error;
  }
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (serviceId && body.pinned_hours !== undefined) {
    await syncHoursPin(supabase, {
      detailerId,
      aircraftId: customId ? null : aircraftId,
      customId,
      serviceId,
      serviceName: body.service_name || '',
      hours: patch.pinned_hours,
    });
  }

  return Response.json({ override: saved });
}

async function syncHoursPin(supabase, { detailerId, aircraftId, customId, serviceId, serviceName, hours }) {
  try {
    let q = supabase.from('detailer_aircraft_overrides').select('id').eq('detailer_id', detailerId).eq('service_id', serviceId);
    q = customId ? q.eq('custom_aircraft_id', customId) : q.eq('aircraft_id', aircraftId).is('custom_aircraft_id', null);
    const { data: existing } = await q.maybeSingle();
    if (hours == null) {
      if (existing?.id) await supabase.from('detailer_aircraft_overrides').delete().eq('id', existing.id).eq('detailer_id', detailerId);
      return;
    }
    if (existing?.id) {
      await supabase.from('detailer_aircraft_overrides').update({ hours, service_name: serviceName || undefined }).eq('id', existing.id);
      return;
    }
    await supabase.from('detailer_aircraft_overrides').insert({
      detailer_id: detailerId,
      aircraft_id: aircraftId,
      custom_aircraft_id: customId,
      service_id: serviceId,
      service_name: serviceName || '',
      hours,
    });
  } catch (e) {
    console.error('[model-offers] hours pin sync failed:', e?.message || e);
  }
}
