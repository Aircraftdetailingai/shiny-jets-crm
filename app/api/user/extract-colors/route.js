import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = n => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

function swatchToRgb(swatch) {
  // colorthief v3 returns Swatch objects with _r, _g, _b
  if (swatch._r !== undefined) return [swatch._r, swatch._g, swatch._b];
  // Older versions return [r, g, b] arrays
  if (Array.isArray(swatch)) return swatch;
  return [swatch.r, swatch.g, swatch.b];
}

function generatePreset(rgb, index) {
  const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
  const [h, s] = hexToHsl(hex);
  return {
    name: `Theme ${index + 1}`,
    primary: hex,
    accent: hslToHex(h, Math.min(s, 40), 10),
    bg: hslToHex(h, Math.min(s, 15), 4),
    surface: hslToHex(h, Math.min(s, 20), 8),
    swatch: hex,
  };
}

export async function POST(request) {
  try {
    const user = await getAuthUser(request);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { logo_url } = await request.json();
    if (!logo_url) return Response.json({ error: 'logo_url required' }, { status: 400 });

    // Fetch image
    const imgRes = await fetch(logo_url);
    if (!imgRes.ok) return Response.json({ error: 'Failed to fetch image' }, { status: 400 });

    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Use colorthief (named export, not a class)
    const { getPalette } = await import('colorthief');
    const palette = await getPalette(buffer, 5);
    console.log('[extract-colors] palette count:', palette.length);

    // Convert swatches to [r,g,b] arrays
    const rgbPalette = palette.map(swatchToRgb);

    // All colors as hex for swatches
    const rawColors = rgbPalette.map(([r, g, b]) => rgbToHex(r, g, b));
    console.log('[extract-colors] rawColors:', rawColors);

    // Filter out very dark or very light colors for presets
    const filtered = rgbPalette.filter(([r, g, b]) => {
      const l = (r + g + b) / 3;
      return l > 30 && l < 230;
    });
    const selected = (filtered.length >= 3 ? filtered : rgbPalette).slice(0, 3);
    const presets = selected.map((rgb, i) => generatePreset(rgb, i));

    // Save raw colors to DB
    try {
      const supabase = getSupabase();
      await supabase
        .from('detailers')
        .update({ theme_colors: rawColors })
        .eq('id', user.id);
    } catch (e) {
      console.log('Failed to save theme_colors:', e.message);
    }

    return Response.json({ presets, rawColors });
  } catch (err) {
    console.error('[extract-colors] error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
