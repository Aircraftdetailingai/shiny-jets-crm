import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const detailerId = formData.get('detailer_id');
    const leadId = formData.get('lead_id');
    const photoCount = parseInt(formData.get('photo_count') || '0');

    if ((!detailerId && !leadId) || photoCount === 0) {
      return Response.json({ error: 'No photos to upload' }, { status: 400 });
    }

    const supabase = getSupabase();
    const timestamp = Date.now();
    const urls = [];

    for (let i = 0; i < photoCount; i++) {
      const file = formData.get(`photo_${i}`);
      const caption = formData.get(`caption_${i}`) || '';

      if (!file || !(file instanceof File)) continue;

      const ext = file.name.split('.').pop() || 'jpg';
      const folder = leadId || detailerId || 'unknown';
      const path = `quote_requests/${folder}/${timestamp}/photo_${i}.${ext}`;

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

    // If lead_id provided, save photo URLs to the lead record
    if (leadId && urls.length > 0) {
      const { data: lead } = await supabase.from('intake_leads').select('photo_urls').eq('id', leadId).single();
      const existing = lead?.photo_urls || [];
      await supabase.from('intake_leads').update({ photo_urls: [...existing, ...urls] }).eq('id', leadId);
    }

    return Response.json({ success: true, urls, uploaded: urls.length });
  } catch (err) {
    console.error('Photo upload error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
