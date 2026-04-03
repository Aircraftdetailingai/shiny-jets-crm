import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

// GET — fetch photos for a job
export async function GET(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get('quote_id');
  if (!quoteId) return Response.json({ error: 'Quote ID required' }, { status: 400 });

  const supabase = getSupabase();
  const { data } = await supabase.from('job_photos').select('*').eq('quote_id', quoteId).eq('detailer_id', user.id).order('created_at');

  return Response.json({ photos: data || [] });
}

// POST — upload before/after photos
export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const quoteId = formData.get('quote_id');
  const photoType = formData.get('photo_type') || 'before'; // before | after
  const surfaceTag = formData.get('surface_tag') || '';
  const caption = formData.get('caption') || '';
  const file = formData.get('photo');

  if (!quoteId || !file) return Response.json({ error: 'Quote ID and photo required' }, { status: 400 });

  const supabase = getSupabase();
  const ext = file.name?.split('.').pop() || 'jpg';
  const path = `job_photos/${user.id}/${quoteId}/${photoType}_${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from('uploads').upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: true });
  if (uploadError) return Response.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path);

  const { data: photo, error } = await supabase.from('job_photos').insert({
    quote_id: quoteId, detailer_id: user.id,
    photo_url: urlData?.publicUrl || path,
    photo_type: photoType, surface_tag: surfaceTag, caption,
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, photo });
}

// DELETE — remove a photo
export async function DELETE(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'Photo ID required' }, { status: 400 });

  const supabase = getSupabase();
  await supabase.from('job_photos').delete().eq('id', id).eq('detailer_id', user.id);

  return Response.json({ success: true });
}
