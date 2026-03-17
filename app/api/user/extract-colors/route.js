import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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

    // Use colorthief
    const ColorThief = (await import('colorthief')).default;
    const ct = new ColorThief();
    const palette = await ct.getPalette(buffer, 5);

    // Filter out very dark or very light colors, pick top 3 distinct
    const filtered = palette.filter(([r, g, b]) => {
      const l = (r + g + b) / 3;
      return l > 30 && l < 230;
    });
    const selected = (filtered.length >= 3 ? filtered : palette).slice(0, 3);

    const presets = selected.map((rgb, i) => generatePreset(rgb, i));

    return Response.json({ presets });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
