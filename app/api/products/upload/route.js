// Product image upload — used by the Add/Edit Product form so the detailer
// can snap a photo (or pick a file) instead of only pasting an image URL.
// Uploads to the public `product-images` bucket and returns the public URL;
// the caller stores it as products.image_url.
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const BUCKET = 'product-images';
const MAX_SIZE = 8 * 1024 * 1024; // 8MB — phone photos run large

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const detailerId = user.detailer_id || user.id;

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !file.name) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const validExts = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];
    let ext = validExts.find(e => name.endsWith(e));
    // iOS sometimes hands over a blob with no extension but a valid mime type.
    if (!ext && (file.type || '').startsWith('image/')) ext = '.jpg';
    if (!ext) {
      return Response.json({ error: 'Only image files are accepted' }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ error: 'Image must be under 8MB' }, { status: 400 });
    }

    // Create the bucket on demand if it hasn't been provisioned yet.
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === BUCKET)) {
      await supabase.storage.createBucket(BUCKET, { public: true });
    }

    const filePath = `${detailerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type
      || (ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType, upsert: false });

    if (uploadErr) {
      return Response.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    return Response.json({ url: urlData.publicUrl, path: filePath });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
