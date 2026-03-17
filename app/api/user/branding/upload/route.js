import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !file.name) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const validExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = validExts.find(e => name.endsWith(e));
    if (!ext) {
      return Response.json({ error: 'Only PNG, JPG, and WebP images are accepted' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return Response.json({ error: 'File must be under 2MB' }, { status: 400 });
    }

    const bucket = 'logos';
    const filePath = `${user.id}/logo${ext}`;

    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === bucket)) {
      await supabase.storage.createBucket(bucket, { public: true });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(filePath, buffer, { contentType, upsert: true });

    if (uploadErr) {
      return Response.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    const logoUrl = urlData.publicUrl;

    await supabase
      .from('detailers')
      .update({ logo_url: logoUrl })
      .eq('id', user.id);

    return Response.json({ logo_url: logoUrl });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
