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

// GET - Get photos for a job
export async function GET(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const quoteId = searchParams.get('quote_id');
  if (!quoteId) return Response.json({ error: 'quote_id required' }, { status: 400 });

  const supabase = getSupabase();

  // Verify job belongs to crew's detailer
  const { data: quote } = await supabase
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!quote) return Response.json({ error: 'Job not found' }, { status: 404 });

  const { data: media, error } = await supabase
    .from('job_media')
    .select('id, media_type, url, notes, created_at')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch photos error:', error);
    return Response.json({ error: 'Failed to fetch photos' }, { status: 500 });
  }

  return Response.json({ photos: media || [] });
}

// POST - Upload a photo for a job
export async function POST(request) {
  const user = await getCrewUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { quote_id, media_type, url, notes } = await request.json();

  if (!quote_id || !media_type || !url) {
    return Response.json({ error: 'quote_id, media_type, and url are required' }, { status: 400 });
  }

  const validTypes = ['before_video', 'before_photo', 'after_photo', 'after_video'];
  if (!validTypes.includes(media_type)) {
    return Response.json({ error: `media_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify job belongs to crew's detailer
  const { data: quote } = await supabase
    .from('quotes')
    .select('id')
    .eq('id', quote_id)
    .eq('detailer_id', user.detailer_id)
    .single();

  if (!quote) return Response.json({ error: 'Job not found' }, { status: 404 });

  let entry = {
    quote_id,
    detailer_id: user.detailer_id,
    media_type,
    url,
    notes: notes || null,
  };

  // Column-stripping retry
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('job_media')
      .insert(entry)
      .select('id, media_type, url, created_at')
      .single();

    if (!error) {
      return Response.json({ success: true, photo: data });
    }

    const colMatch = error.message?.match(/column "([^"]+)".*does not exist/);
    if (colMatch) {
      delete entry[colMatch[1]];
      continue;
    }

    console.error('Upload photo error:', error);
    return Response.json({ error: 'Failed to upload photo' }, { status: 500 });
  }

  return Response.json({ error: 'Failed to upload photo' }, { status: 500 });
}
