/**
 * Shared color utility functions for branding system.
 * Pure functions — no dependencies — works client-side and server-side.
 */

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map(c => c / 255);
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

export function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toH = n => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toH(f(0))}${toH(f(8))}${toH(f(4))}`;
}

// WCAG 2.0 relative luminance
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex).map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// WCAG AA contrast ratio
export function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Check WCAG AA compliance
export function checkContrast(foreground, background) {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio: Math.round(ratio * 100) / 100,
    normalText: ratio >= 4.5,
    largeText: ratio >= 3.0,
  };
}

// Suggest accessible color by adjusting lightness
export function suggestAccessibleColor(foreground, background, targetRatio = 4.5) {
  const [h, s] = hexToHsl(foreground);
  const bgLum = relativeLuminance(background);
  const direction = bgLum < 0.5 ? 1 : -1;
  const [, , startL] = hexToHsl(foreground);
  for (let step = 0; step <= 100; step++) {
    const newL = Math.max(0, Math.min(100, startL + direction * step));
    const candidate = hslToHex(h, s, newL);
    if (contrastRatio(candidate, background) >= targetRatio) return candidate;
  }
  return direction > 0 ? '#FFFFFF' : '#000000';
}

// Generate 3 palette options from extracted brand colors
// brandColors: array of hex strings sorted by saturation (most vibrant first)
export function generatePalettes(primaryHex, brandColors = []) {
  const [h, s, l] = hexToHsl(primaryHex);
  const secondColor = brandColors.length > 1 ? brandColors[1] : null;

  return [
    {
      name: 'Bold',
      description: 'Your brand colors on a dark background',
      primary: primaryHex,
      secondary: secondColor || hslToHex((h + 30) % 360, Math.min(s, 50), Math.max(Math.min(l, 55), 40)),
      neutral: '#0D1B2A',
    },
    {
      name: 'Complementary',
      description: 'Primary color with its complement',
      primary: primaryHex,
      secondary: hslToHex((h + 180) % 360, Math.min(s, 60), Math.max(Math.min(l, 50), 35)),
      neutral: '#0D1B2A',
    },
    {
      name: 'Monochromatic',
      description: 'Tints and shades of your primary',
      primary: primaryHex,
      secondary: hslToHex(h, Math.max(s - 10, 15), Math.min(l + 40, 85)),
      neutral: hslToHex(h, Math.min(s, 15), Math.max(l - 30, 5)),
    },
  ];
}

// Filter and sort extracted RGB colors: remove noise, sort by saturation
export function filterAndSortColors(rgbColors) {
  return rgbColors
    .filter(([r, g, b]) => {
      // Remove near-white
      if (r > 240 && g > 240 && b > 240) return false;
      // Remove near-black
      if (r < 20 && g < 20 && b < 20) return false;
      // Remove near-gray (R, G, B within 20 of each other)
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (spread < 20) return false;
      return true;
    })
    .map(([r, g, b]) => {
      const hex = rgbToHex(r, g, b);
      const [, sat] = hexToHsl(hex);
      return { r, g, b, hex, saturation: sat };
    })
    .sort((a, b) => b.saturation - a.saturation)
    .map(c => c.hex);
}

// Map a palette + dark/light mode to the 4 DB theme columns
export function paletteToTheme(palette, mode = 'dark') {
  const [h, s] = hexToHsl(palette.primary);
  if (mode === 'light') {
    return {
      primary: palette.primary,
      accent: palette.secondary,
      bg: '#FFFFFF',
      surface: '#F3F4F6',
    };
  }
  return {
    primary: palette.primary,
    accent: palette.secondary,
    bg: hslToHex(h, Math.min(s, 15), 4),
    surface: hslToHex(h, Math.min(s, 20), 8),
  };
}
