import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// d7b2d9e cache-bust pattern — anchors are written from Settings and read by
// the calibration UI, so a stale Function-cache snapshot would show "Pick your
// anchors" right after a save.
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: 'no-store' }) } },
  );
}

const NO_STORE = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' };

function labelFor(row) {
  if (!row) return null;
  return `${row.make || ''} ${row.model || ''}`.trim() || null;
}

export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: NO_STORE });

  const supabase = getSupabase();
  const { data: row, error } = await supabase
    .from('detailers')
    .select('id, name, email, company, slug, plan, calibration_anchor_a, calibration_anchor_b')
    .eq('id', user.id)
    .single();

  if (error || !row) {
    return new Response(JSON.stringify({ error: 'Detailer not found' }), { status: 404, headers: NO_STORE });
  }

  // Resolve anchor labels from aircraft_hours so the UI can render names
  // without a second round-trip. Skip the join when both are null.
  const ids = [row.calibration_anchor_a, row.calibration_anchor_b].filter(Boolean);
  let anchorMap = {};
  if (ids.length > 0) {
    const { data: anchors } = await supabase
      .from('aircraft_hours')
      .select('id, make, model')
      .in('id', ids);
    for (const a of anchors || []) anchorMap[a.id] = a;
  }

  return new Response(
    JSON.stringify({
      id: row.id,
      name: row.name,
      email: row.email,
      plan: row.plan,
      calibration_anchor_a: row.calibration_anchor_a,
      calibration_anchor_b: row.calibration_anchor_b,
      calibration_anchor_a_label: labelFor(anchorMap[row.calibration_anchor_a]),
      calibration_anchor_b_label: labelFor(anchorMap[row.calibration_anchor_b]),
    }),
    { status: 200, headers: NO_STORE },
  );
}

export async function PATCH(request) {
  const user = await getAuthUser(request);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: NO_STORE });

  let body;
  try { body = await request.json(); } catch { body = {}; }

  // Only mutate columns we know how to handle on this endpoint. Refuse to
  // null-write anchors when the body doesn't explicitly include them — a
  // future caller editing a different detailer field shouldn't wipe anchors.
  const update = {};

  const aProvided = Object.prototype.hasOwnProperty.call(body, 'calibration_anchor_a');
  const bProvided = Object.prototype.hasOwnProperty.call(body, 'calibration_anchor_b');

  if (aProvided || bProvided) {
    const supabase = getSupabase();

    // Need the current row so we can validate "different from each other"
    // when only one side is being updated.
    const { data: current } = await supabase
      .from('detailers')
      .select('calibration_anchor_a, calibration_anchor_b')
      .eq('id', user.id)
      .single();

    const nextA = aProvided ? body.calibration_anchor_a : current?.calibration_anchor_a;
    const nextB = bProvided ? body.calibration_anchor_b : current?.calibration_anchor_b;

    // Both required to be set together when initializing; once one is set,
    // the other can be updated independently as long as they remain distinct.
    const idsToCheck = [nextA, nextB].filter(Boolean);
    if (idsToCheck.length > 0) {
      const { data: rows, error: lookupErr } = await supabase
        .from('aircraft_hours')
        .select('id')
        .in('id', idsToCheck);
      if (lookupErr) {
        console.error('[detailers/me] anchor lookup error:', lookupErr);
        return new Response(JSON.stringify({ error: 'Failed to validate anchors' }), { status: 500, headers: NO_STORE });
      }
      const found = new Set((rows || []).map(r => r.id));
      for (const id of idsToCheck) {
        if (!found.has(id)) {
          return new Response(JSON.stringify({ error: 'Anchor aircraft not found in catalog' }), { status: 400, headers: NO_STORE });
        }
      }
    }

    if (nextA && nextB && nextA === nextB) {
      return new Response(JSON.stringify({ error: 'Anchor A and Anchor B must be different aircraft' }), { status: 400, headers: NO_STORE });
    }

    if (aProvided) update.calibration_anchor_a = body.calibration_anchor_a || null;
    if (bProvided) update.calibration_anchor_b = body.calibration_anchor_b || null;
  }

  if (Object.keys(update).length === 0) {
    return new Response(JSON.stringify({ error: 'No supported fields in body' }), { status: 400, headers: NO_STORE });
  }

  const supabase = getSupabase();
  // Auth gate: .eq('id', user.id) means a token can only mutate its own row.
  const { data, error } = await supabase
    .from('detailers')
    .update(update)
    .eq('id', user.id)
    .select('id, calibration_anchor_a, calibration_anchor_b')
    .single();

  if (error) {
    console.error('[detailers/me] update error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: NO_STORE });
  }

  // Re-resolve labels for the response so the client doesn't need a follow-up GET.
  const ids = [data.calibration_anchor_a, data.calibration_anchor_b].filter(Boolean);
  let anchorMap = {};
  if (ids.length > 0) {
    const { data: anchors } = await supabase
      .from('aircraft_hours')
      .select('id, make, model')
      .in('id', ids);
    for (const a of anchors || []) anchorMap[a.id] = a;
  }

  return new Response(
    JSON.stringify({
      success: true,
      calibration_anchor_a: data.calibration_anchor_a,
      calibration_anchor_b: data.calibration_anchor_b,
      calibration_anchor_a_label: labelFor(anchorMap[data.calibration_anchor_a]),
      calibration_anchor_b_label: labelFor(anchorMap[data.calibration_anchor_b]),
    }),
    { status: 200, headers: NO_STORE },
  );
}
