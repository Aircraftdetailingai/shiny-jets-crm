/** Human-readable labels for aircraft category / size enums. */
export const AIRCRAFT_CATEGORY_LABELS = {
  piston: 'Piston',
  turboprop: 'Turboprop',
  light_jet: 'Light Jet',
  midsize_jet: 'Midsize Jet',
  mid_jet: 'Midsize Jet',
  super_midsize_jet: 'Super Midsize Jet',
  large_jet: 'Large Jet',
  heavy_jet: 'Heavy Jet',
  helicopter: 'Helicopter',
  ultralight: 'Ultralight',
  experimental: 'Experimental',
};

/** Turn snake_case enums into Title Case words when no map entry exists. */
export function humanizeAircraftCategory(value) {
  if (value == null || value === '') return '';
  const key = String(value).trim();
  if (!key) return '';
  if (AIRCRAFT_CATEGORY_LABELS[key]) return AIRCRAFT_CATEGORY_LABELS[key];
  if (AIRCRAFT_CATEGORY_LABELS[key.toLowerCase()]) return AIRCRAFT_CATEGORY_LABELS[key.toLowerCase()];
  // Already human ("Gulfstream G4") — leave alone if it has spaces or no underscores
  if (!key.includes('_') && /[A-Z]/.test(key[0]) && key !== key.toLowerCase()) return key;
  if (!key.includes('_')) return key;
  return key
    .split('_')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Prefer model; fall back to humanized type/category. */
export function aircraftDisplayName({ aircraft_model, aircraft_type, aircraft_name, aircraft_make } = {}) {
  if (aircraft_name) return aircraft_name;
  const model = aircraft_model || aircraft_make;
  if (model) return model;
  return humanizeAircraftCategory(aircraft_type) || 'Aircraft';
}
