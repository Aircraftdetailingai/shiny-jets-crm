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

export async function POST(request) {
  try {
    const formData = await request.formData();
    // Accept either `token` (new path) or `lead_id` (legacy/UUID-direct).
    const ref = formData.get('token') || formData.get('lead_id');
    const photoCount = parseInt(formData.get('photo_count') || '0');

    if (!ref || photoCount === 0) {
      return Response.json({ error: 'No photos to upload' }, { status: 400 });
    }

    const supabase = getSupabase();
    const lead = await resolveLead(supabase, String(ref));
    if (!lead) return Response.json({ error: 'Upload link invalid or expired' }, { status: 404 });

    const timestamp = Date.now();
    const urls = [];

    for (let i = 0; i < photoCount; i++) {
      const file = formData.get(`photo_${i}`);
      const caption = formData.get(`caption_${i}`) || '';

      if (!file || !(file instanceof File)) continue;

      const ext = file.name.split('.').pop() || 'jpg';
      const path = `quote_requests/${lead.detailer_id}/${lead.id}/${timestamp}/photo_${i}.${ext}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(path, buffer, {
          contentType: file.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error(`Photo ${i} upload error:`, uploadError.message);
        continue;
      }

      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path);
      urls.push({ url: urlData?.publicUrl || path, caption });
    }

    if (urls.length > 0) {
      const existing = lead.photo_urls || [];
      await supabase.from('intake_leads').update({
        photo_urls: [...existing, ...urls],
        photo_uploaded_at: new Date().toISOString(),
      }).eq('id', lead.id);
    }

    return Response.json({ success: true, urls, uploaded: urls.length });
  } catch (err) {
    console.error('Photo upload error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
