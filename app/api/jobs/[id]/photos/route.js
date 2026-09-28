import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/plan-gate';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function ensureBucket(supabase) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find(b => b.name === 'job-photos')) {
    await supabase.storage.createBucket('job-photos', { public: true });
  }
}

// GET - List photos for a job grouped by type
export async function GET(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: user });
  if (planGate) return planGate;

  const { id: jobId } = await params;
  const supabase = getSupabase();

  // Verify job exists and user has access
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, detailer_id')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) return Response.json({ error: 'Job not found' }, { status: 404 });

  // Owner must own the job; crew must belong to same detailer
  const detailerId = user.id;
  if (job.detailer_id !== detailerId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: photos, error } = await supabase
    .from('job_photos')
    .select('id, photo_type, url, filename, uploaded_by, uploaded_by_name, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Fetch job photos error:', error);
    return Response.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }

  const grouped = { before: [], after: [], issue: [] };
  for (const p of (photos || [])) {
    const bucket = grouped[p.photo_type] || grouped.before;
    bucket.push(p);
  }

  return Response.json({ photos: grouped });
}

// POST - Upload a photo
export async function POST(request, { params }) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: user });
  if (planGate) return planGate;

  const { id: jobId } = await params;
  const supabase = getSupabase();

  // Verify job
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, detailer_id')
    .eq('id', jobId)
    .single();

  if (jobErr || !job) return Response.json({ error: 'Job not found' }, { status: 404 });

  const detailerId = user.id;
  if (job.detailer_id !== detailerId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse multipart form data
  const formData = await request.formData();
  const file = formData.get('file');
  const photoType = formData.get('photo_type');

  if (!file || !photoType) {
    return Response.json({ error: 'file and photo_type are required' }, { status: 400 });
  }

  const validTypes = ['before', 'after', 'issue'];
  if (!validTypes.includes(photoType)) {
    return Response.json({ error: `photo_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
  }

  // Ensure bucket exists
  await ensureBucket(supabase);

  // Upload to storage
  const timestamp = Date.now();
  const filename = file.name || 'photo.jpg';
  const storagePath = `${detailerId}/${jobId}/${photoType}/${timestamp}_${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from('job-photos')
    .upload(storagePath, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });

  if (uploadErr) {
    console.error('Storage upload error:', uploadErr);
    return Response.json({ error: 'Failed to upload file' }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('job-photos')
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // Insert into job_photos
  const uploaderName = user.name || user.company || 'Unknown';
  let entry = {
    job_id: jobId,
    detailer_id: detailerId,
    photo_type: photoType,
    url: publicUrl,
    filename,
    uploaded_by: user.id,
    uploaded_by_name: uploaderName,
  };

  // Column-stripping retry
  let insertedPhoto = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error: insertErr } = await supabase
      .from('job_photos')
      .insert(entry)
      .select('id, url, photo_type, filename')
      .single();

    if (!insertErr) {
      insertedPhoto = data;
      break;
    }

    const colMatch = insertErr.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      delete entry[colMatch[1]];
      continue;
    }

    console.error('Insert job_photos error:', insertErr);
    return Response.json({ error: 'Failed to save photo record' }, { status: 500 });
  }

  if (!insertedPhoto) {
    return Response.json({ error: 'Failed to save photo record' }, { status: 500 });
  }

  // Log to crew_activity_log
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: detailerId,
      team_member_id: user.id,
      team_member_name: uploaderName,
      job_id: jobId,
      action_type: 'photo_upload',
      action_details: {
        photo_id: insertedPhoto.id,
        photo_type: photoType,
        filename,
      },
    });
  } catch (logErr) {
    console.error('Activity log error:', logErr);
  }

  return Response.json({ photo: insertedPhoto });
}

// DELETE - Remove a photo (owner only)
export async function DELETE(request, { params }) {
  const owner = await getAuthUser(request);
  if (!owner) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const planGate = await requireFeature(request, 'jobs', { user: owner });
  if (planGate) return planGate;

  const { id: jobId } = await params;
  const { searchParams } = new URL(request.url);
  const photoId = searchParams.get('photo_id');

  if (!photoId) {
    return Response.json({ error: 'photo_id query param required' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify photo belongs to this job and owner
  const { data: photo, error: photoErr } = await supabase
    .from('job_photos')
    .select('id, url, filename, detailer_id')
    .eq('id', photoId)
    .eq('job_id', jobId)
    .single();

  if (photoErr || !photo) {
    return Response.json({ error: 'Photo not found' }, { status: 404 });
  }

  if (photo.detailer_id !== owner.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Delete from storage - extract path from URL
  try {
    const urlObj = new URL(photo.url);
    const pathMatch = urlObj.pathname.match(/\/object\/public\/job-photos\/(.+)/);
    if (pathMatch) {
      await supabase.storage.from('job-photos').remove([pathMatch[1]]);
    }
  } catch (storageErr) {
    console.error('Storage delete error:', storageErr);
    // Continue to delete DB record even if storage delete fails
  }

  // Delete from job_photos
  const { error: deleteErr } = await supabase
    .from('job_photos')
    .delete()
    .eq('id', photoId);

  if (deleteErr) {
    console.error('Delete job_photos error:', deleteErr);
    return Response.json({ error: 'Failed to delete photo' }, { status: 500 });
  }

  return Response.json({ success: true });
}
