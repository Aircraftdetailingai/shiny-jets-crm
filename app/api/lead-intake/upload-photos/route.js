import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveLead(supabase, ref) {
  if (!ref) return null;
  if (UUID_RE.test(ref)) {
    const { data } = await supabase.from('intake_leads')
      .select('id, detailer_id, photo_urls')
      .eq('id', ref).single();
    return data;
  }
  const { data } = await supabase.from('intake_leads')
    .select('id, detailer_id, photo_urls')
    .eq('photo_request_token', ref).single();
  return data;
}

// Three modes — all unauthenticated, gated only by what's in the form data:
//
//   A. TOKEN mode    — formData.token        — Request Photos email link
//                      (552c3a2). Lead already exists; append photos to its
//                      photo_urls and stamp photo_uploaded_at.
//
//   B. PUBLIC mode   — formData.detailer_id  — initial submission from the
//                      public intake form (/request/[slug]). No lead yet, no
//                      token. Write photos to a per-detailer staging path
//                      keyed on timestamp so concurrent submissions don't
//                      collide. Return URLs — the form-submit endpoint
//                      /api/lead-intake/leads stores them on the new lead's
//                      photo_urls column when it creates the row right after.
//
//   C. LEGACY mode   — formData.lead_id      — UUID-direct path retained for
//                      tools that already have a lead row in hand.
//
// Before this commit the route required (A) or (C) and 400'd everything
// else. Every public intake form submission since the 552c3a2 regression
// (May 28) — Brett Miller 5/28, Lance Sampson 5/21, Jordan Smith 6/5, Tyler
// Transki 6/15 — failed at the same 400 gate. The fix is the new PUBLIC
// branch; modes A + C are byte-for-byte untouched.
export async function POST(request) {
  try {
    const formData = await request.formData();
    const token = formData.get('token');
    const leadId = formData.get('lead_id');
    const detailerId = formData.get('detailer_id');
    const photoCount = parseInt(formData.get('photo_count') || '0');

    if (photoCount === 0) {
      return Response.json({ error: 'No photos to upload' }, { status: 400 });
    }
    if (!token && !leadId && !detailerId) {
      return Response.json({
        error: 'Missing identifier. Provide one of: token (Request Photos email), lead_id (existing intake lead), or detailer_id (public intake form).',
      }, { status: 400 });
    }

    const supabase = getSupabase();
    const timestamp = Date.now();
    const urls = [];

    // Resolve lead for token / lead_id modes. PUBLIC mode skips this — the
    // lead doesn't exist yet.
    let lead = null;
    if (token || leadId) {
      lead = await resolveLead(supabase, String(token || leadId));
      if (!lead) return Response.json({ error: 'Upload link invalid or expired' }, { status: 404 });
    }

    // Storage path differs per mode. PUBLIC writes to intake_staging/ — the
    // form-submit endpoint persists the returned URLs on the new lead row.
    const baseDir = lead
      ? `quote_requests/${lead.detailer_id}/${lead.id}/${timestamp}`
      : `intake_staging/${String(detailerId)}/${timestamp}`;

    for (let i = 0; i < photoCount; i++) {
      const file = formData.get(`photo_${i}`);
      const caption = formData.get(`caption_${i}`) || '';

      if (!file || !(file instanceof File)) continue;

      const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
      const path = `${baseDir}/photo_${i}.${ext}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(path, buffer, {
          contentType: file.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error(`[upload-photos] photo ${i} upload error:`, uploadError.message);
        continue;
      }

      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path);
      urls.push({ url: urlData?.publicUrl || path, caption });
    }

    // Token / lead_id mode: persist URLs to the existing lead immediately.
    // Public mode: caller will pass the URLs into /api/lead-intake/leads on
    // form submit, so no DB write here.
    if (lead && urls.length > 0) {
      const existing = lead.photo_urls || [];
      await supabase.from('intake_leads').update({
        photo_urls: [...existing, ...urls],
        photo_uploaded_at: new Date().toISOString(),
      }).eq('id', lead.id);
    }

    return Response.json({
      success: true,
      mode: token ? 'token' : (leadId ? 'lead_id' : 'detailer_id'),
      urls,
      uploaded: urls.length,
    });
  } catch (err) {
    console.error('[upload-photos] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
