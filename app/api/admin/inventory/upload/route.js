import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = [
  'brett@aircraftdetailing.ai',
  'admin@aircraftdetailing.ai',
  'brett@shinyjets.com',
  'brett@vectorav.ai',
];

const BUCKET = 'reward-images';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function isAdmin(request) {
  const user = await getAuthUser(request);
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email?.toLowerCase());
}

async function ensureBucket(supabase) {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
}

export async function POST(request) {
  try {
    if (!await isAdmin(request)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'DB error' }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ error: 'File too large. Max 5MB.' }, { status: 400 });

    await ensureBucket(supabase);

    const ext = file.name.split('.').pop() || 'jpg';
    const storagePath = `inventory/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(storagePath);

    return Response.json({ url: publicUrl, path: storagePath });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
