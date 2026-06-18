// Level 2 — per-aircraft SOP overrides. Owner-only for now; broader role
// gating is Stage 2 work. POST auto-creates a customer_aircraft row if
// none exists yet for the (detailer, tail) pair so the owner can pin a
// SOP for an aircraft that hasn't been formally added to the file
// system — staff still see the override on the next job for that tail.

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { findOrCreateAircraftByTail, resolveAircraftIdByTail } from '@/lib/resolve-aircraft';
import { signSopUrls } from '@/lib/sop-signed-url';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

async function requireOwner(request) {
  const user = await getAuthUser(request);
  if (!user) return { error: { message: 'Unauthorized', status: 401 } };
  if (user.role && user.role !== 'owner' && user.role !== 'detailer') {
    return { error: { message: 'Owner access required (Stage 2 expands this)', status: 403 } };
  }
  return { user };
}

// GET — list overrides for one aircraft (?aircraft_id=…) or one tail
//       (?tail=…) within the owner's detailer scope.
export async function GET(request) {
  const { user, error: authErr } = await requireOwner(request);
  if (authErr) return Response.json({ error: authErr.message }, { status: authErr.status });

  const supabase = getSupabase();
  const url = new URL(request.url);
  const aircraftIdParam = url.searchParams.get('aircraft_id');
  const tailParam = url.searchParams.get('tail');
  const detailerId = user.detailer_id || user.id;

  let aircraftId = aircraftIdParam || null;
  if (!aircraftId && tailParam) {
    aircraftId = await resolveAircraftIdByTail(supabase, { detailer_id: detailerId, tail_number: tailParam });
  }
  if (!aircraftId) return Response.json({ overrides: [] });

  const { data, error } = await supabase
    .from('aircraft_service_sops')
    .select('id, aircraft_id, service_id, sop_url, sop_summary, sop_file_path, sop_file_name, created_at, updated_at')
    .eq('detailer_id', detailerId)
    .eq('aircraft_id', aircraftId);

  if (error) {
    console.error('[aircraft-service-sops GET]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Sign any sop_file_path values so the client can render PDFs through
  // the private bucket without ever holding a public URL. Same expiry
  // as the services catalog GET.
  let overrides = data || [];
  const paths = overrides.map((o) => o.sop_file_path).filter(Boolean);
  if (paths.length > 0) {
    try {
      const signedMap = await signSopUrls(supabase, paths);
      overrides = overrides.map((o) =>
        o.sop_file_path && signedMap.has(o.sop_file_path)
          ? { ...o, sop_signed_url: signedMap.get(o.sop_file_path) }
          : o,
      );
    } catch (e) {
      console.warn('[aircraft-service-sops GET] sign SOPs failed (non-fatal):', e?.message || e);
    }
  }

  return Response.json({ aircraft_id: aircraftId, overrides });
}

// POST — create or upsert an override.
//   Body: { service_id, sop_url, sop_summary?, aircraft_id? | tail_number? }
// If neither aircraft_id nor tail_number resolves to a customer_aircraft
// row, one is created using the tail_number provided.
export async function POST(request) {
  const { user, error: authErr } = await requireOwner(request);
  if (authErr) return Response.json({ error: authErr.message }, { status: authErr.status });

  const supabase = getSupabase();
  const body = await request.json().catch(() => ({}));
  const { service_id, sop_url, sop_summary, sop_file_path, sop_file_name, aircraft_id: bodyAircraftId, tail_number } = body;
  const detailerId = user.detailer_id || user.id;

  // One of sop_url or sop_file_path must be provided. Either form is
  // valid; the read surfaces prefer file when both are set.
  if (!service_id || (!sop_url && !sop_file_path)) {
    return Response.json({ error: 'service_id and one of sop_url / sop_file_path are required' }, { status: 400 });
  }

  // Verify the service belongs to this detailer before binding an
  // override to it — prevents an owner from pinning SOPs against
  // another detailer's service ids.
  const { data: svc } = await supabase
    .from('services')
    .select('id')
    .eq('id', service_id)
    .eq('detailer_id', detailerId)
    .maybeSingle();
  if (!svc) return Response.json({ error: 'Service not found' }, { status: 404 });

  // Resolve aircraft_id: prefer explicit, else from tail, else create.
  let aircraftId = bodyAircraftId || null;
  let aircraftCreated = false;
  if (!aircraftId && tail_number) {
    const out = await findOrCreateAircraftByTail(supabase, {
      detailer_id: detailerId,
      tail_number,
    });
    aircraftId = out.aircraft_id;
    aircraftCreated = out.created;
  }
  if (!aircraftId) {
    return Response.json({ error: 'aircraft_id or tail_number is required' }, { status: 400 });
  }

  // Upsert-by-(aircraft_id, service_id). Manual existence check rather
  // than ON CONFLICT — matches the service_products fix we shipped 6/15
  // (the unique constraint exists here, but the manual pattern keeps
  // the error surface uniform across the codebase).
  const { data: existing } = await supabase
    .from('aircraft_service_sops')
    .select('id')
    .eq('aircraft_id', aircraftId)
    .eq('service_id', service_id)
    .maybeSingle();

  const row = {
    detailer_id: detailerId,
    aircraft_id: aircraftId,
    service_id,
    sop_url: sop_url ? String(sop_url).trim() : null,
    sop_summary: sop_summary ? String(sop_summary) : null,
    sop_file_path: sop_file_path ? String(sop_file_path) : null,
    sop_file_name: sop_file_name ? String(sop_file_name) : null,
    updated_at: new Date().toISOString(),
  };

  const q = existing
    ? supabase.from('aircraft_service_sops').update(row).eq('id', existing.id)
    : supabase.from('aircraft_service_sops').insert(row);
  const { data: saved, error } = await q
    .select('id, aircraft_id, service_id, sop_url, sop_summary, sop_file_path, sop_file_name, created_at, updated_at')
    .single();

  if (error) {
    console.error('[aircraft-service-sops POST]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    override: saved,
    aircraft_created: aircraftCreated,
  }, { status: existing ? 200 : 201 });
}

// PUT — update a specific override by id. Body: { id, sop_url?, sop_summary? }
export async function PUT(request) {
  const { user, error: authErr } = await requireOwner(request);
  if (authErr) return Response.json({ error: authErr.message }, { status: authErr.status });

  const supabase = getSupabase();
  const body = await request.json().catch(() => ({}));
  const { id, sop_url, sop_summary, sop_file_path, sop_file_name } = body;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const detailerId = user.detailer_id || user.id;
  const updates = { updated_at: new Date().toISOString() };
  if (sop_url !== undefined) updates.sop_url = sop_url ? String(sop_url).trim() : null;
  if (sop_summary !== undefined) updates.sop_summary = sop_summary ? String(sop_summary) : null;
  if (sop_file_path !== undefined) updates.sop_file_path = sop_file_path ? String(sop_file_path) : null;
  if (sop_file_name !== undefined) updates.sop_file_name = sop_file_name ? String(sop_file_name) : null;

  const { data, error } = await supabase
    .from('aircraft_service_sops')
    .update(updates)
    .eq('id', id)
    .eq('detailer_id', detailerId)
    .select('id, aircraft_id, service_id, sop_url, sop_summary, sop_file_path, sop_file_name, created_at, updated_at')
    .single();

  if (error) {
    console.error('[aircraft-service-sops PUT]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ override: data });
}

// DELETE — remove an override by id. Body or query: { id }.
export async function DELETE(request) {
  const { user, error: authErr } = await requireOwner(request);
  if (authErr) return Response.json({ error: authErr.message }, { status: authErr.status });

  const supabase = getSupabase();
  const url = new URL(request.url);
  let id = url.searchParams.get('id');
  if (!id) {
    const body = await request.json().catch(() => ({}));
    id = body?.id;
  }
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });

  const detailerId = user.detailer_id || user.id;
  const { error } = await supabase
    .from('aircraft_service_sops')
    .delete()
    .eq('id', id)
    .eq('detailer_id', detailerId);

  if (error) {
    console.error('[aircraft-service-sops DELETE]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true });
}
