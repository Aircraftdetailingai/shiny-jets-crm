// SOP PDF upload — used by both the service edit modal (L1 default SOP)
// and the aircraft SOP dialog (L2 override). Uploads to the private
// "sop-documents" bucket via the server-side service role so we never
// ship a Supabase anon key with storage-write to the client.
//
// Path convention: {detailer_id}/{scope_id}/{sanitized_filename}
//   scope='service'  → scope_id = service_id
//   scope='aircraft' → scope_id = aircraft_id
// Re-uploading with the same filename replaces (upsert: true).
//
// Returns: { sop_file_path, sop_file_name, signed_url } — caller PATCHes
// the path + name onto the service row or aircraft_service_sops row.

import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { signSopUrl } from '@/lib/sop-signed-url';

export const dynamic = 'force-dynamic';

const BUCKET = 'sop-documents';
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB ceiling — generous for PDFs but bounded.

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  );
}

// Strip path separators + restrict to a safe character set. Preserves
// the .pdf extension so Storage serves the right Content-Type.
function sanitizeFilename(name) {
  const fallback = `sop-${Date.now()}.pdf`;
  if (!name) return fallback;
  const base = String(name).split('/').pop().split('\\').pop();
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!cleaned) return fallback;
  // Force .pdf if extension was stripped or wrong
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`;
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const detailerId = user.detailer_id || user.id;

    const formData = await request.formData();
    const file = formData.get('file');
    const scope = formData.get('scope'); // 'service' | 'aircraft'
    const scopeId = formData.get('scope_id');

    if (!file || !(file instanceof File)) {
      return Response.json({ error: 'file is required (multipart/form-data field "file")' }, { status: 400 });
    }
    if (scope !== 'service' && scope !== 'aircraft') {
      return Response.json({ error: 'scope must be "service" or "aircraft"' }, { status: 400 });
    }
    if (!scopeId) {
      return Response.json({ error: 'scope_id is required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 413 });
    }
    if (file.type && file.type !== 'application/pdf') {
      return Response.json({ error: 'Only PDF files are accepted' }, { status: 415 });
    }

    const supabase = getSupabase();

    // Ownership check — owner can only attach SOPs to their own services
    // or customer_aircraft rows. Prevents cross-detailer path injection
    // (e.g. someone POSTing scope_id of another detailer's service id).
    if (scope === 'service') {
      const { data: svc } = await supabase
        .from('services')
        .select('id')
        .eq('id', scopeId)
        .eq('detailer_id', detailerId)
        .maybeSingle();
      if (!svc) return Response.json({ error: 'Service not found' }, { status: 404 });
    } else {
      const { data: ac } = await supabase
        .from('customer_aircraft')
        .select('id')
        .eq('id', scopeId)
        .eq('detailer_id', detailerId)
        .maybeSingle();
      if (!ac) return Response.json({ error: 'Aircraft not found' }, { status: 404 });
    }

    const safeName = sanitizeFilename(file.name);
    const path = `${detailerId}/${scopeId}/${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase
      .storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadErr) {
      console.error('[sop-upload]', uploadErr.message);
      return Response.json({ error: uploadErr.message }, { status: 500 });
    }

    const signed_url = await signSopUrl(supabase, path);

    return Response.json({
      sop_file_path: path,
      sop_file_name: file.name || safeName,
      signed_url,
    });
  } catch (err) {
    console.error('[sop-upload] exception:', err?.message || err);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// DELETE — remove an uploaded SOP file. Body: { sop_file_path }. The
// caller is responsible for nulling sop_file_path on the owning row via
// the services PUT or aircraft-service-sops PUT — this endpoint is just
// for the storage-side cleanup. Safe to call before the row update so a
// failed delete doesn't leave a half-stale state.
export async function DELETE(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const detailerId = user.detailer_id || user.id;

    const url = new URL(request.url);
    let path = url.searchParams.get('path');
    if (!path) {
      const body = await request.json().catch(() => ({}));
      path = body?.sop_file_path;
    }
    if (!path) return Response.json({ error: 'sop_file_path required' }, { status: 400 });

    // Defense in depth — the path is shaped {detailer_id}/{scope_id}/{file},
    // so the caller's detailer_id MUST be the first segment. Prevents an
    // owner from blowing away another detailer's storage object even with
    // the service role.
    if (!path.startsWith(`${detailerId}/`)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = getSupabase();
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) {
      console.warn('[sop-upload DELETE]', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ success: true });
  } catch (err) {
    console.error('[sop-upload DELETE] exception:', err?.message || err);
    return Response.json({ error: 'Delete failed' }, { status: 500 });
  }
}
