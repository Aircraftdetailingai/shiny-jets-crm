import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const detailerId = formData.get('detailer_id');
    const photoCount = parseInt(formData.get('photo_count') || '0');

    if (!detailerId || photoCount === 0) {
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
      const path = `quote_requests/${detailerId}/${timestamp}/photo_${i}.${ext}`;

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

    return Response.json({ success: true, urls, uploaded: urls.length });
  } catch (err) {
    console.error('Photo upload error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
