import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

async function getCrewUser(request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload || payload.role !== 'crew') return null;
  return payload;
}

async function resolveJobOrQuote(supabase, id, detailerId) {
  const { data: job } = await supabase.from('jobs').select('id').eq('id', id).eq('detailer_id', detailerId).maybeSingle();
  if (job) return { job_id: id, quote_id: null };
  const { data: quote } = await supabase.from('quotes').select('id').eq('id', id).eq('detailer_id', detailerId).maybeSingle();
  if (quote) return { job_id: null, quote_id: id };
  return null;
}

// GET - Get photos for a job
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('quote_id') || searchParams.get('job_id');
  if (!id) return Response.json({ error: 'job_id or quote_id required' }, { status: 400 });

  const supabase = getSupabase();
  const ref = await resolveJobOrQuote(supabase, id, user.detailer_id);
  if (!ref) return Response.json({ error: 'Job not found' }, { status: 404 });

  const { data: media, error } = await supabase
    .from('job_media')
    .select('id, media_type, photo_type, url, notes, created_at, team_member_id')
    .or(`job_id.eq.${id},quote_id.eq.${id}`)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[crew/photos] fetch error:', error);
    return Response.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }

  return Response.json({ photos: media || [] });
}

// POST - Upload a photo for a job
export async function POST(request) {
  console.log('[crew/photos] POST received');

  const user = await getCrewUser(request);
  if (!user) {
    console.log('[crew/photos] no crew user — unauthorized');
    return Response.json({ error: 'Unauthorized — please log in again' }, { status: 401 });
  }
  console.log('[crew/photos] user:', { id: user.id, detailer_id: user.detailer_id, name: user.name });

  // Parse body defensively
  let body;
  try {
    body = await request.json();
  } catch (parseErr) {
    console.error('[crew/photos] body parse error:', parseErr.message);
    return Response.json({ error: 'Photo data corrupted or too large. Try a smaller photo.' }, { status: 400 });
  }

  const { quote_id, job_id, media_type, photo_type, url, notes, captured_at, latitude, longitude, location_name: clientLocationName, device_info } = body || {};
  const refId = job_id || quote_id;

  // Reverse geocode lat/lng to a friendly address (Nominatim, free, no key)
  let resolvedLocationName = clientLocationName || null;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=16`,
        { headers: { 'User-Agent': 'ShinyJetsCRM/1.0 (brett@shinyjets.com)' }, signal: AbortSignal.timeout(3000) }
      );
      if (geoRes.ok) {
        const geo = await geoRes.json();
        if (geo?.display_name) resolvedLocationName = geo.display_name;
      }
    } catch (e) {
      console.log('[crew/photos] reverse geocode failed (using fallback):', e.message);
    }
  }

  if (!refId || !media_type || !url) {
    console.log('[crew/photos] missing fields:', { refId, media_type, hasUrl: !!url });
    return Response.json({ error: 'Missing required photo data (job, type, or image)' }, { status: 400 });
  }

  const validTypes = ['before_video', 'before_photo', 'after_photo', 'after_video'];
  if (!validTypes.includes(media_type)) {
    return Response.json({ error: `Invalid media type: ${media_type}` }, { status: 400 });
  }

  const supabase = getSupabase();
  const ref = await resolveJobOrQuote(supabase, refId, user.detailer_id);
  if (!ref) {
    console.log('[crew/photos] job not found:', refId, 'detailer:', user.detailer_id);
    return Response.json({ error: 'Job not found in your account' }, { status: 404 });
  }

  // Try Supabase Storage upload first
  let finalUrl = url;
  let storageUploaded = false;
  let storageErrorMsg = null;

  if (url.startsWith('data:')) {
    try {
      const matches = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        console.error('[crew/photos] invalid data URL format');
        return Response.json({ error: 'Invalid photo format' }, { status: 400 });
      }

      const contentType = matches[1];
      const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      const buffer = Buffer.from(matches[2], 'base64');
      const sizeKB = Math.round(buffer.length / 1024);
      console.log('[crew/photos] image size:', sizeKB, 'KB, type:', contentType);

      const path = `${user.detailer_id}/${refId}/${media_type}_${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('job-photos')
        .upload(path, buffer, { contentType, upsert: true });

      if (uploadErr) {
        storageErrorMsg = uploadErr.message;
        console.error('[crew/photos] storage upload failed:', uploadErr.message, 'size:', sizeKB, 'KB');

        // Try to create bucket and retry once
        try {
          await supabase.storage.createBucket('job-photos', { public: true });
          const { error: retryErr } = await supabase.storage.from('job-photos').upload(path, buffer, { contentType, upsert: true });
          if (!retryErr) {
            const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
            finalUrl = urlData.publicUrl;
            storageUploaded = true;
            console.log('[crew/photos] uploaded after bucket creation:', path);
          }
        } catch {}

        // Final fallback: store as base64 in DB if image is small enough
        if (!storageUploaded) {
          if (buffer.length > 800 * 1024) {
            console.error('[crew/photos] base64 fallback rejected — image too large:', sizeKB, 'KB > 800KB');
            return Response.json({
              error: `Photo too large to save (${sizeKB}KB). Storage upload failed and image exceeds DB fallback limit.`,
              storage_error: storageErrorMsg,
            }, { status: 413 });
          }
          // Keep finalUrl as the original data URL — DB will store base64
          console.log('[crew/photos] using base64 DB fallback, size:', sizeKB, 'KB');
        }
      } else {
        const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
        finalUrl = urlData.publicUrl;
        storageUploaded = true;
        console.log('[crew/photos] uploaded to storage:', path);
      }
    } catch (storageErr) {
      console.error('[crew/photos] storage exception:', storageErr.message, storageErr.stack);
      storageErrorMsg = storageErr.message;
      // Continue with base64 fallback
    }
  }

  // Insert into job_media — include geo + capture metadata
  let entry = {
    job_id: ref.job_id,
    quote_id: ref.quote_id,
    detailer_id: user.detailer_id,
    team_member_id: user.id,
    media_type,
    photo_type: photo_type || (media_type.startsWith('before') ? 'pre_job' : media_type.startsWith('after') ? 'post_job' : 'in_progress'),
    url: finalUrl,
    notes: notes || null,
    captured_at: captured_at || new Date().toISOString(),
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    location_name: resolvedLocationName,
    device_info: device_info || null,
  };

  let inserted = null;
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('job_media')
      .insert(entry)
      .select('id, media_type, photo_type, url, created_at, team_member_id')
      .single();

    if (!error) { inserted = data; break; }
    lastError = error;
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
    if (colMatch) {
      console.log('[crew/photos] stripping missing column:', colMatch[1]);
      delete entry[colMatch[1]];
      continue;
    }
    // RLS or permission errors get explicit logging
    if (error.code === '42501' || error.message?.includes('row-level security') || error.message?.includes('policy')) {
      console.error('[crew/photos] RLS BLOCK — job_media INSERT denied by policy. error:', error.message, 'detailer:', user.detailer_id, 'team_member:', user.id);
      return Response.json({ error: 'Permission denied saving photo. Contact support.' }, { status: 403 });
    }
    console.error('[crew/photos] job_media INSERT failed:', error.message, 'code:', error.code, 'details:', error.details, 'hint:', error.hint);
    break;
  }

  if (!inserted) {
    return Response.json({
      error: `Database save failed: ${lastError?.message || 'unknown error'}`,
      storage_error: storageErrorMsg,
    }, { status: 500 });
  }

  console.log('[crew/photos] photo saved:', inserted.id, 'storage:', storageUploaded ? 'yes' : 'base64-fallback');

  // Activity log (non-blocking)
  try {
    await supabase.from('crew_activity_log').insert({
      detailer_id: user.detailer_id,
      team_member_id: user.id,
      team_member_name: user.name,
      job_id: ref.job_id || ref.quote_id,
      action_type: 'photo_upload',
      action_details: {
        media_type,
        photo_type: entry.photo_type,
        photo_id: inserted.id,
        storage_method: storageUploaded ? 'storage' : 'base64',
      },
    });
  } catch (e) {
    console.error('[crew/photos] activity log error:', e.message);
  }

  return Response.json({ success: true, photo: inserted, storage_method: storageUploaded ? 'storage' : 'base64' });
}
