import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - Get current terms
export async function GET(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const { data, error } = await supabase
      .from('detailers')
      .select('terms_pdf_url, terms_text, terms_updated_at')
      .eq('id', user.id)
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      terms_pdf_url: data?.terms_pdf_url || null,
      terms_text: data?.terms_text || null,
      terms_updated_at: data?.terms_updated_at || null,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// POST - Save terms (text or PDF URL)
export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    const contentType = request.headers.get('content-type') || '';

    let updateFields = { terms_updated_at: new Date().toISOString() };

    if (contentType.includes('multipart/form-data')) {
      // PDF upload
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file || !file.name) {
        return Response.json({ error: 'No file provided' }, { status: 400 });
      }

      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return Response.json({ error: 'Only PDF files are accepted' }, { status: 400 });
      }

      if (file.size > 5 * 1024 * 1024) {
        return Response.json({ error: 'File must be under 5MB' }, { status: 400 });
      }

      // Upload to Supabase Storage
      const bucket = 'terms';
      const filePath = `${user.id}/terms.pdf`;

      // Ensure bucket exists
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.find(b => b.name === bucket)) {
        await supabase.storage.createBucket(bucket, { public: true });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(filePath, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadErr) {
        return Response.json({ error: 'Upload failed: ' + uploadErr.message }, { status: 500 });
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      updateFields.terms_pdf_url = urlData.publicUrl;
      updateFields.terms_text = null; // Clear text if PDF uploaded

    } else {
      // JSON body with text terms
      const { terms_text } = await request.json();
      if (!terms_text || !terms_text.trim()) {
        return Response.json({ error: 'Terms text is required' }, { status: 400 });
      }
      updateFields.terms_text = terms_text.trim();
      updateFields.terms_pdf_url = null; // Clear PDF if text saved
    }

    const { error: updateErr } = await supabase
      .from('detailers')
      .update(updateFields)
      .eq('id', user.id);

    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500 });
    }

    return Response.json({
      success: true,
      terms_pdf_url: updateFields.terms_pdf_url || null,
      terms_text: updateFields.terms_text || null,
      terms_updated_at: updateFields.terms_updated_at,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// DELETE - Remove terms
export async function DELETE(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Database not configured' }, { status: 500 });

    // Remove file from storage if it exists
    await supabase.storage.from('terms').remove([`${user.id}/terms.pdf`]);

    const { error } = await supabase
      .from('detailers')
      .update({ terms_pdf_url: null, terms_text: null, terms_updated_at: null })
      .eq('id', user.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
