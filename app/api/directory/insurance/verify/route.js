import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export async function POST(request) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { url } = await request.json();
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No AI key — mark as pending manual review
    const supabase = getSupabase();
    await supabase.from('detailers').update({
      insurance_url: url,
      insurance_verified: false,
    }).eq('id', user.id);
    return Response.json({ success: false, error: 'AI verification not configured — pending manual review' });
  }

  try {
    // Fetch the file to check if it's an image
    const fileRes = await fetch(url);
    const contentType = fileRes.headers.get('content-type') || '';
    const isImage = contentType.startsWith('image/');

    let result;
    if (isImage) {
      // Send image to Claude
      const imgBuffer = await fileRes.arrayBuffer();
      const base64 = Buffer.from(imgBuffer).toString('base64');
      const mediaType = contentType.includes('png') ? 'image/png' : 'image/jpeg';

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
              { type: 'text', text: 'Extract the insurance expiration date from this certificate of insurance. Return only JSON: { "expiry_date": "YYYY-MM-DD", "policy_number": "string", "insurer": "string" }' },
            ],
          }],
        }),
      });
      const claudeData = await claudeRes.json();
      const text = claudeData.content?.[0]?.text || '';
      const jsonMatch = text.match(/\{[^}]+\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } else {
      // PDF — can't send to Claude vision directly, mark for manual review
      const supabase = getSupabase();
      await supabase.from('detailers').update({ insurance_url: url, insurance_verified: false }).eq('id', user.id);
      return Response.json({ success: false, error: 'PDF uploaded — pending manual verification. Please upload an image of your COI for instant verification.' });
    }

    if (result?.expiry_date) {
      const supabase = getSupabase();
      await supabase.from('detailers').update({
        insurance_url: url,
        insurance_expiry_date: result.expiry_date,
        insurance_verified: true,
        insurance_policy_number: result.policy_number || null,
        insurance_insurer: result.insurer || null,
      }).eq('id', user.id);
      return Response.json({ success: true, ...result });
    }

    return Response.json({ success: false, error: 'Could not extract expiry date from certificate' });
  } catch (err) {
    console.error('[insurance-verify] Error:', err);
    return Response.json({ success: false, error: 'Verification failed: ' + err.message });
  }
}
