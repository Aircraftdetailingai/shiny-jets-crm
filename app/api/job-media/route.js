import { createClient } from '@supabase/supabase-js';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getUser(request) {
  try {
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth_token')?.value;
    if (authCookie) {
      const user = await verifyToken(authCookie);
      if (user) return user;
    }
  } catch (e) {}
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return await verifyToken(authHeader.slice(7));
  }
  return null;
}

// GET - Get media for a job/quote
export async function GET(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const refId = searchParams.get('quote_id') || searchParams.get('job_id');

    if (!refId) {
      return Response.json({ error: 'quote_id or job_id required' }, { status: 400 });
    }

    const detailerId = user.detailer_id || user.id;

    // Verify user owns this job (check both tables)
    const { data: quote } = await supabase.from('quotes').select('id').eq('id', refId).eq('detailer_id', detailerId).maybeSingle();
    let owned = !!quote;
    if (!owned) {
      const { data: job } = await supabase.from('jobs').select('id').eq('id', refId).eq('detailer_id', detailerId).maybeSingle();
      owned = !!job;
    }
    if (!owned) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    // Query by both job_id OR quote_id
    const { data: media, error } = await supabase
      .from('job_media')
      .select('*')
      .or(`job_id.eq.${refId},quote_id.eq.${refId}`)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch media:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Separate by type
    const beforeMedia = media?.filter(m => m.media_type.startsWith('before_')) || [];
    const afterMedia = media?.filter(m => m.media_type.startsWith('after_')) || [];

    return Response.json({
      media: media || [],
      beforeMedia,
      afterMedia,
      hasBeforeMedia: beforeMedia.length > 0,
      hasAfterMedia: afterMedia.length > 0,
    });

  } catch (err) {
    console.error('Job media GET error:', err);
    return Response.json({ error: 'Failed to fetch media' }, { status: 500 });
  }
}

// POST - Add media to a job
export async function POST(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Accept both FormData (file upload) and JSON (url-based)
    const contentType = request.headers.get('content-type') || '';
    let quote_id, job_id, media_type, photo_type, url, notes, surface_tag;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      quote_id = formData.get('quote_id');
      job_id = formData.get('job_id');
      media_type = formData.get('media_type');
      photo_type = formData.get('photo_type') || null;
      notes = formData.get('notes') || null;
      surface_tag = formData.get('surface_tag') || null;
      const file = formData.get('file');
      const refId = job_id || quote_id;

      if (!refId || !media_type || !file) {
        return Response.json({ error: 'job_id (or quote_id), media_type, and file required' }, { status: 400 });
      }

      // Upload to Supabase Storage
      const ext = (file.name || 'photo.jpg').split('.').pop() || 'jpg';
      const path = `${user.id}/${refId}/${media_type}_${Date.now()}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadErr } = await supabase.storage
        .from('job-photos')
        .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false });

      if (uploadErr) {
        console.error('[job-media] storage upload error:', uploadErr.message);
        // Fallback: try 'photos' bucket
        const { error: fallbackErr } = await supabase.storage
          .from('photos')
          .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false });
        if (fallbackErr) {
          console.error('[job-media] fallback storage error:', fallbackErr.message);
          // Last resort: use data URL
          const base64 = buffer.toString('base64');
          url = `data:${file.type || 'image/jpeg'};base64,${base64}`;
        } else {
          const { data: publicData } = supabase.storage.from('photos').getPublicUrl(path);
          url = publicData?.publicUrl;
        }
      } else {
        const { data: publicData } = supabase.storage.from('job-photos').getPublicUrl(path);
        url = publicData?.publicUrl;
      }
    } else {
      const body = await request.json();
      quote_id = body.quote_id;
      job_id = body.job_id;
      media_type = body.media_type;
      photo_type = body.photo_type || null;
      url = body.url;
      notes = body.notes || null;
      surface_tag = body.surface_tag || null;
    }

    const refId = job_id || quote_id;
    if (!refId || !media_type || !url) {
      return Response.json({ error: 'job_id (or quote_id), media_type, and url required' }, { status: 400 });
    }

    const validTypes = ['before_video', 'before_photo', 'after_photo', 'after_video'];
    if (!validTypes.includes(media_type)) {
      return Response.json({ error: 'Invalid media_type' }, { status: 400 });
    }

    const detailerId = user.detailer_id || user.id;

    // Resolve which table the ID belongs to — set the correct column
    let resolvedJobId = null;
    let resolvedQuoteId = null;
    const { data: jobRow } = await supabase.from('jobs').select('id').eq('id', refId).eq('detailer_id', detailerId).maybeSingle();
    if (jobRow) {
      resolvedJobId = refId;
    } else {
      const { data: quoteRow } = await supabase.from('quotes').select('id').eq('id', refId).eq('detailer_id', detailerId).maybeSingle();
      if (quoteRow) resolvedQuoteId = refId;
    }
    if (!resolvedJobId && !resolvedQuoteId) {
      return Response.json({ error: 'Job not found' }, { status: 404 });
    }

    let entry = {
      job_id: resolvedJobId,
      quote_id: resolvedQuoteId,
      media_type,
      photo_type: photo_type || (media_type.startsWith('before') ? 'pre_job' : media_type.startsWith('after') ? 'post_job' : 'in_progress'),
      url,
      notes: notes || null,
      surface_tag: surface_tag || null,
      detailer_id: detailerId,
      team_member_id: user.id,
    };

    // Column-stripping retry
    let media = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase.from('job_media').insert(entry).select().single();
      if (!error) { media = data; break; }
      const colMatch = error.message?.match(/column "([^"]+)".*does not exist/) || error.message?.match(/Could not find the '([^']+)' column/);
      if (colMatch) { delete entry[colMatch[1]]; continue; }
      console.error('[job-media] insert error:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!media) return Response.json({ error: 'Failed to create media' }, { status: 500 });
    return Response.json({ media }, { status: 201 });

  } catch (err) {
    console.error('Job media POST error:', err);
    return Response.json({ error: 'Failed to create media' }, { status: 500 });
  }
}

// DELETE - Remove media
export async function DELETE(request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get('id');
    const idsParam = searchParams.get('ids'); // comma-separated for bulk delete
    const detailerId = user.detailer_id || user.id;

    if (!mediaId && !idsParam) {
      return Response.json({ error: 'id or ids required' }, { status: 400 });
    }

    const idList = idsParam ? idsParam.split(',').filter(Boolean) : [mediaId];

    // Delete only if user owns them
    const { error } = await supabase
      .from('job_media')
      .delete()
      .in('id', idList)
      .eq('detailer_id', detailerId);

    if (error) {
      console.error('Failed to delete media:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error('Job media DELETE error:', err);
    return Response.json({ error: 'Failed to delete media' }, { status: 500 });
  }
}
