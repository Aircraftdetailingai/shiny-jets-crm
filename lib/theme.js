/**
 * Generate a full dark theme from a single primary hex color.
 * Used by onboarding and settings for consistent theme generation.
 */
export function generateThemeFromPrimary(hex) {
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
  h = Math.round(h * 360);
  s = Math.round(s * 100);
  const hslToHex = (hv, sv, lv) => {
    sv /= 100; lv /= 100;
    const k = n => (n + hv / 30) % 12;
    const a = sv * Math.min(lv, 1 - lv);
    const f = n => lv - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toH = n => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toH(f(0))}${toH(f(8))}${toH(f(4))}`;
  };
  return {
    primary: hex,
    accent: hslToHex(h, Math.min(s, 40), 10),
    bg: hslToHex(h, Math.min(s, 15), 4),
    surface: hslToHex(h, Math.min(s, 20), 8),
  };
}

/**
 * Compute the dimmed version of a hex color (82% brightness) for hover states.
 */
export function computeDimColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b].map(c => Math.max(0, Math.round(c * 0.82)).toString(16).padStart(2, '0')).join('');
}

/**
 * Apply a primary color to CSS variables on the document.
 */
export function applyThemeToCss(hex) {
  document.documentElement.style.setProperty('--v-gold', hex);
  document.documentElement.style.setProperty('--v-gold-dim', computeDimColor(hex));
}

/**
 * Apply full theme (dark or light mode + brand color) to entire CRM.
 * Sets all CSS variables so Tailwind classes like bg-v-charcoal, text-v-text-primary etc. respond.
 */
export function applyFullTheme(mode, primaryHex) {
  const s = document.documentElement.style;
  const hex = primaryHex || '#007CB1';

  // Brand accent color
  s.setProperty('--v-gold', hex);
  s.setProperty('--v-gold-dim', computeDimColor(hex));

  if (mode === 'light') {
    s.setProperty('--v-charcoal', '#F4F6F8');
    s.setProperty('--v-navy', '#EEF1F4');
    s.setProperty('--v-sidebar', '#FFFFFF');
    s.setProperty('--v-surface', '#FFFFFF');
    s.setProperty('--v-surface-light', '#E8ECF1');
    s.setProperty('--v-gold-muted', computeDimColor(computeDimColor(hex)));
    s.setProperty('--v-border', '#D1D5DB');
    s.setProperty('--v-border-subtle', '#E5E7EB');
    s.setProperty('--v-text-primary', '#0B0D12');
    s.setProperty('--v-text-secondary', '#4B5563');
    document.documentElement.classList.add('theme-light');
    document.documentElement.classList.remove('theme-dark');
  } else {
    s.setProperty('--v-charcoal', '#0F1117');
    s.setProperty('--v-navy', '#0D1B2A');
    s.setProperty('--v-sidebar', '#080C12');
    s.setProperty('--v-surface', '#1A2236');
    s.setProperty('--v-surface-light', '#1E2A40');
    s.setProperty('--v-gold-muted', '#005070');
    s.setProperty('--v-border', '#2A3A50');
    s.setProperty('--v-border-subtle', '#1A2236');
    s.setProperty('--v-text-primary', '#F5F5F5');
    s.setProperty('--v-text-secondary', '#8A9BB0');
    document.documentElement.classList.add('theme-dark');
    document.documentElement.classList.remove('theme-light');
  }
}
