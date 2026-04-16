import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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

// Resolve which table an ID belongs to (jobs or quotes)
async function resolveJobOrQuote(supabase, id, detailerId) {
  const { data: job } = await supabase.from('jobs').select('id').eq('id', id).eq('detailer_id', detailerId).maybeSingle();
  if (job) return { job_id: id, quote_id: null };
  const { data: quote } = await supabase.from('quotes').select('id').eq('id', id).eq('detailer_id', detailerId).maybeSingle();
  if (quote) return { job_id: null, quote_id: id };
  return null;
}

// GET - Get photos for a job (queries by both job_id and quote_id)
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
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { quote_id, job_id, media_type, photo_type, url, notes } = body;
  const refId = job_id || quote_id;

  if (!refId || !media_type || !url) {
    return Response.json({ error: 'job_id (or quote_id), media_type, and url are required' }, { status: 400 });
  }

  const validTypes = ['before_video', 'before_photo', 'after_photo', 'after_video'];
  if (!validTypes.includes(media_type)) {
    return Response.json({ error: `media_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
  }

  const supabase = getSupabase();
  const ref = await resolveJobOrQuote(supabase, refId, user.detailer_id);
  if (!ref) {
    console.log('[crew/photos] Job not found:', refId, 'detailer:', user.detailer_id);
    return Response.json({ error: 'Job not found' }, { status: 404 });
  }

  // Upload base64 to Supabase Storage if it's a data URL
  let finalUrl = url;
  if (url.startsWith('data:')) {
    try {
      const matches = url.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const contentType = matches[1];
        const ext = contentType.split('/')[1] || 'jpg';
        const buffer = Buffer.from(matches[2], 'base64');
        const path = `${user.detailer_id}/${refId}/${media_type}/${Date.now()}.${ext}`;

        await supabase.storage.createBucket('job-photos', { public: true }).catch(() => {});

        const { error: uploadErr } = await supabase.storage
          .from('job-photos')
          .upload(path, buffer, { contentType, upsert: true });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
          finalUrl = urlData.publicUrl;
        } else {
          console.error('[crew/photos] storage error:', uploadErr.message, 'size:', buffer.length);
        }
      }
    } catch (storageErr) {
      console.error('[crew/photos] storage exception:', storageErr.message);
    }
  }

  // Build entry — supports both new columns (job_id, photo_type, team_member_id) and legacy (quote_id only)
  let entry = {
    job_id: ref.job_id,
    quote_id: ref.quote_id,
    detailer_id: user.detailer_id,
    team_member_id: user.id,
    media_type,
    photo_type: photo_type || (media_type.startsWith('before') ? 'pre_job' : media_type.startsWith('after') ? 'post_job' : 'in_progress'),
    url: finalUrl,
    notes: notes || null,
  };

  // Column-stripping retry for missing columns
  let inserted = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('job_media')
      .insert(entry)
      .select('id, media_type, photo_type, url, created_at, team_member_id')
      .single();

    if (!error) { inserted = data; break; }
    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
    if (colMatch) { delete entry[colMatch[1]]; continue; }
    console.error('[crew/photos] insert error:', error.message);
    return Response.json({ error: 'Failed to upload photo' }, { status: 500 });
  }

  if (!inserted) {
    return Response.json({ error: 'Failed to upload photo' }, { status: 500 });
  }

  // Write to crew_activity_log (non-blocking)
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
        url: finalUrl,
      },
    });
  } catch (e) {
    console.error('[crew/photos] activity log error:', e.message);
  }

  return Response.json({ success: true, photo: inserted });
}
