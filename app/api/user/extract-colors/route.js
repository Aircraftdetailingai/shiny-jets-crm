import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';
import { rgbToHex, generatePalettes, filterAndSortColors } from '@/lib/color-utils';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

function swatchToRgb(swatch) {
  if (swatch._r !== undefined) return [swatch._r, swatch._g, swatch._b];
  if (Array.isArray(swatch)) return swatch;
  return [swatch.r, swatch.g, swatch.b];
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { logo_url } = await request.json();
    if (!logo_url) return Response.json({ error: 'logo_url required' }, { status: 400 });

    const imgRes = await fetch(logo_url);
    if (!imgRes.ok) return Response.json({ error: 'Failed to fetch image' }, { status: 400 });

    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const { getPalette } = await import('colorthief');
    const palette = await getPalette(buffer, 8);

    const rgbPalette = palette.map(swatchToRgb);

    // Filter noise and sort by saturation (most vibrant first)
    const brandColors = filterAndSortColors(rgbPalette);

    // Fallback: if filtering removed everything, use raw colors
    const rawColors = rgbPalette.map(([r, g, b]) => rgbToHex(r, g, b));
    const finalColors = brandColors.length > 0 ? brandColors.slice(0, 5) : rawColors.slice(0, 5);

    // Generate 3 palette combos from the most vibrant extracted colors
    const primaryHex = finalColors[0] || '#C9A84C';
    const palettes = generatePalettes(primaryHex, finalColors);

    // Save to DB
    try {
      const supabase = getSupabase();
      await supabase
        .from('detailers')
        .update({ theme_colors: finalColors })
        .eq('id', user.id);
    } catch (e) {
      console.log('Failed to save theme_colors:', e.message);
    }

    return Response.json({ palettes, rawColors: finalColors });
  } catch (err) {
    console.error('[extract-colors] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
